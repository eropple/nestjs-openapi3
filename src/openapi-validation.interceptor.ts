import { NestInterceptor, ExecutionContext, CallHandler, HttpStatus } from '@nestjs/common';
import { Observable } from 'rxjs';
import * as _ from 'lodash';
import Ajv, { ErrorObject } from 'ajv';
import * as O3TS from 'openapi3-ts';
import { Request, Response } from 'express';

import { getAllParameterMetadata } from './utils';
import { OPENAPI_REQUEST_INDEX, OPENAPI_REQUEST_BODY, OPENAPI_PARAMETER_BY_INDEX } from './decorators/metadata-keys';
import { observableResponse } from './utils/observable-responses';

const INTERNAL_WRAPPER = '__$wrap__';

interface ValidationBody {
  argPosition: number;
  bodyContentTypes: Array<string>;
  validators: { [mediaType: string]: Ajv.ValidateFunction };
}

interface ValidationParameter {
  name: string;
  argPosition: number;
  parameter: O3TS.ParameterObject;
  validator: Ajv.ValidateFunction;
}

/**
 * Best to memoize some of this stuff so we don't have to recompute
 * half the world every time we run.
 */
interface ValidationCacheData {
  body?: ValidationBody;
  parameters: Array<ValidationParameter>;
}

function wrapSpecifiedSchema(schema?: O3TS.SchemaObject | O3TS.ReferenceObject): O3TS.SchemaObject {
  schema = _.cloneDeep(schema);
  const ref = (schema as any).$ref;
  if (ref) {
    schema = { $ref: `root-document.json${ref}` };
  }

  return {
    type: 'object',
    required: [INTERNAL_WRAPPER],
    properties: {
      [INTERNAL_WRAPPER]: schema || {},
    },
  };
}

/**
 * There is an annoying tension between the use of TypeScript type information
 * for parameters and with NestJS's parameter handling. By default, NestJS just
 * passes parameters through based on your decorators. That's not the worst
 * thing in the world, but given the way we're dealing with things, it's close;
 * you end up with something obviously deficient like this:
 *
 * ```typescript
 * myHandler(@Query('foo') foo: number) {
 *   console.log(typeof(foo)) // this will be 'string'
 * }
 * ```
 *
 * With our OpenAPI metadata, we already have a way to fix this and coerce types
 * correctly to match what we expect to get out of the other end, while also
 * properly rejecting unrecognized media types and otherwise just generally
 * Cleaning Up Our Act.
 *
 * This interceptor does a few things:
 *
 * -  Performs media type negotiation for request bodies, returns code 415
 *    (Media Type Unsupported) if negotiation fails
 * -  For both request body parameters and for path/query/header params:
 *    - Checks them against the provided parameter schemas
 *    - Coerces types where possible (i.e., a `number` query parameter will be
 *      turned into an actual `number` instead of a string)
 *
 * **TODO:**  The generation of the validation cache can be done eagerly
 *            instead of lazily. This would improve performance after startup
 *            (whether that's better than a faster startup is open for debate)
 *            and may smoke out errors in consumer systems more quickly.
 */
export class OpenapiValidationInterceptor implements NestInterceptor {
  // IMPORTANT NOTE: because this is a global interceptor, it seems that
  //                 `ExecutionContext#getArgs` doesn't work right (it
  //                 returns req/res/next rather than the handler args).
  //                 Because of this, you'll see this interceptor doing
  //                 a lot of work to patch the request object on its
  //                 behalf. This might be simplified in the future.

  private readonly ajv: Ajv.Ajv;
  // tslint:disable-next-line: ban-types
  private readonly validationCache: Map<Function, ValidationCacheData> = new Map();

  constructor(
    private readonly document: O3TS.OpenAPIObject,
  ) {
    this.ajv = new Ajv({
      coerceTypes: true,
      removeAdditional: 'failing',
      extendRefs: 'fail',
      useDefaults: true,
    });
    this.ajv.addSchema(document, 'root-document.json');
  }

  intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> | Promise<Observable<any>> {
    const handler = context.getHandler();

    let validationData = this.validationCache.get(handler);
    if (!validationData) {
      validationData = this.buildValidationData(context);
      // this.validationCache.set(handler, validationData);
    }

    const httpContext = context.switchToHttp();
    const request: Request = httpContext.getRequest();
    const response: Response = httpContext.getResponse();

    const errors: Array<[string, ErrorObject]> = [];

    const { body } = validationData;
    if (body) {
      const contentType = request.header('content-type') || 'application/json';

      const bodyValidator = body.validators[contentType];
      if (!bodyValidator) {
        return observableResponse(
          response,
          { errors: [`Unsupported body content type: ${contentType}`] },
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        );
      }

      const inValue = request.body;
      const valid = bodyValidator({ [INTERNAL_WRAPPER]: inValue });

      if (!valid) {
        const bodyErrors: Array<[string, ErrorObject]> =
          (bodyValidator.errors || [])
            .map(e => ['request body', e]);
        errors.push(...bodyErrors);
      }
    }

    for (const validationParameter of validationData.parameters) {
      const inValue = this.getParameterFromRequest(request, validationParameter.parameter);
      const wrappedInValue = { [INTERNAL_WRAPPER]: inValue };
      const valid = validationParameter.validator(wrappedInValue);

      // we have to do it this way because these parameters may (likely will)
        // be primitives, and ajv can't re-reference a primitive.
      if (valid) {
        this.setParameterInRequest(request, validationParameter.parameter, wrappedInValue[INTERNAL_WRAPPER]);
      } else {
        const paramErrors: Array<[string, ErrorObject]> =
          (validationParameter.validator.errors || [])
            .map(e => [`parameter '${validationParameter.name}'`, e]);
        errors.push(...paramErrors);
      }
    }

    if (errors.length > 0) {
      const resp = {
        errors: errors.map(e =>
          `${e[0]}: ${e[1].dataPath.replace(`.${INTERNAL_WRAPPER}.`, '')} ${e[1].message}`),
      };

      return observableResponse(response, resp, 400);
    }

    return next.handle();
  }

  private buildValidationData(context: ExecutionContext): ValidationCacheData {
    const controller = context.getClass();
    const handler = context.getHandler();

    const endpointMetadata = getAllParameterMetadata(controller.prototype, handler.name);

    const requestBodyIndex: number | undefined = endpointMetadata[OPENAPI_REQUEST_INDEX];
    const requestBody: O3TS.RequestBodyObject | undefined = endpointMetadata[OPENAPI_REQUEST_BODY];

    let body: ValidationBody | undefined;
    if (typeof(requestBodyIndex) === 'number' && requestBody) {
      body = {
        argPosition: requestBodyIndex,
        bodyContentTypes:
          Object.keys(requestBody.content).sort((a, b) => {
            if (a.startsWith('application/json')) {
              return -1;
            }

            if (b.startsWith('application/json')) {
              return 1;
            }

            return (a > b) ? 1 : -1;
          }),
        validators:
          _.fromPairs(
            _.toPairs(requestBody.content).map(
              t => [t[0], this.ajv.compile(wrapSpecifiedSchema(t[1].schema))])),
      };
    }

    const parameters: Array<ValidationParameter> = [];
    const parameterMap: Map<number, O3TS.ParameterObject> | undefined = endpointMetadata[OPENAPI_PARAMETER_BY_INDEX];

    if (parameterMap) {
      for (const [argPosition, parameter] of parameterMap.entries()) {
        parameters.push({
          name: parameter.name,
          argPosition,
          parameter,
          validator: this.ajv.compile(wrapSpecifiedSchema(parameter.schema)),
        });
      }
    }

    return { body, parameters };
  }

  private getParameterFromRequest(request: Request, parameter: O3TS.ParameterObject) {
    // TODO: Parse non-simple parameter styles here
    switch (parameter.in) {
      case 'cookie':
        throw new Error(`Cookie parameters are unsupported.`);
      case 'header':
        return request.headers[parameter.name.toLowerCase()];
      case 'query':
        return request.query[parameter.name];
      case 'path':
        return request.params[parameter.name];
    }
  }

  private setParameterInRequest(request: Request, parameter: O3TS.ParameterObject, value: any) {
    switch (parameter.in) {
      case 'cookie':
        throw new Error(`Cookie parameters are unsupported.`);
      case 'header':
        return request.headers[parameter.name.toLowerCase()] = value;
      case 'query':
        return request.query[parameter.name] = value;
      case 'path':
        return request.params[parameter.name] = value;
    }
  }
}
