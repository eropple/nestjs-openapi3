// These decorators apply to arguments in endpoints.

import {
  Param as NestParam,
  Query as NestQuery,
  Headers as NestHeaders,
  Body as NestBody,
  createParamDecorator,
  BadRequestException,
  UnsupportedMediaTypeException,
  Type,
  PipeTransform,
} from '@nestjs/common';
import { Request } from 'express';
import * as O3TS from 'openapi3-ts';
import _ from 'lodash';
import Ajv from 'ajv';

import { Ctor, SchemaLike, RequestBodyWithSchemaLike } from '../../types';
import {
  getAllParameterMetadata,
  inferSchema,
  appendArrayMetadata,
  parseSchemaLike,
  mergeObjectMetadata,
  parseViaSchema,
  addToMapMetadata,
} from '../../utils';
import {
  OPENAPI_INTERNAL_MODELS_TO_PARSE,
  OPENAPI_REQUEST_BODY,
  OPENAPI_PARAMETER,
  OPENAPI_PARAMETER_BY_INDEX,
  OPENAPI_REQUEST_INDEX,
  OPENAPI_PARAMETER_PROPERTY_KEYS,
} from '../metadata-keys';
import { DefinitionError } from '../../errors';

const ajv = new Ajv({ coerceTypes: true });

type RequestFetchFn = (req: Request) => unknown;

function createValidatingRequestDecorator(fn: RequestFetchFn, schema: O3TS.SchemaObject) {
  let validator: Ajv.ValidateFunction;

  // We have to wrap the schema to enable Ajv's coercion, otherwise we lose referential
  // control (e.g., a `number` parameter will remain a `string` because Ajv can't
  // re-point our reference to the original value).
  const wrappedSchema: O3TS.SchemaObject = {
    type: 'object',
    properties: {
      value: schema,
    },
  };

  try {
    validator = ajv.compile(wrappedSchema);
  } catch (err) {
    throw new DefinitionError(`AJV errored when parsing OpenAPI schema:\n\n${err}`);
  }

  return createParamDecorator((data, req) => {
    const wrappedValue = { value: parseViaSchema(ajv, validator, fn(req)) };

    if (validator) {
      const valid = validator(wrappedValue);

      if (!valid) {
        const errors = ajv.errors;
        throw new BadRequestException('Invalid request.', ajv.errorsText(errors));
      }
    }

    return wrappedValue.value;
  });
}

type BaseParameterFn =
  (
    parameterMetadata: { [k: string]: any },
    parameterType: any,
    modelsToParse: Array<Ctor>,
  ) => void;

function baseParameterHandler(
  paramKind: string,
  target: object,
  propertyKey: string | symbol,
  parameterIndex: number,
  fn: BaseParameterFn,
) {
  try {
    const parameterMetadata = getAllParameterMetadata(target, propertyKey);
    const parameterType = parameterMetadata['design:paramtypes'][parameterIndex];
    const modelsToParse: Array<Ctor> = [];

    fn(parameterMetadata, parameterType, modelsToParse);

    appendArrayMetadata(OPENAPI_INTERNAL_MODELS_TO_PARSE, modelsToParse, target, propertyKey);
  } catch (err) {
    throw new DefinitionError(`Error when parsing ${paramKind}, parameter '${propertyKey.toString()}':\n\n${err.toString()}`);
  }
}

export interface BodyOpts {
  pipes?: Array<Type<PipeTransform> | PipeTransform>;
}

/**
 * Defines a request body for the given operation. This wraps the underlying
 * NestJS `@Body()` annotation, making it unnecessary to call both `@OAS.Body()`
 * and `@Body()` on the same endpoint.
 *
 * Types ('schemas' in OpenAPI parlance) can be handled in one of two ways:
 * inference or explicit declaration. If you choose to declare a type
 * explicitly, you'll need to pass an OpenAPI schema or a reference to one. This
 * allows for covering some complicated situations. However, if all you need is
 * to say "this takes a JSON-compatible request body of a given type", you may
 * be able to rely on inference.
 */
export function Body(args: RequestBodyWithSchemaLike = {}, opts: BodyOpts = {}): ParameterDecorator {
  return (target: object, propertyKey: string | symbol, parameterIndex: number) => {
    baseParameterHandler('Body', target, propertyKey, parameterIndex,
      (parameterMetadata, parameterType, modelsToParse) => {
        const requestBody: O3TS.RequestBodyObject = {
          description: args.description,
          required: args.required,
          content: {},
        };

        const content: { [mediaType: string]: SchemaLike } = { ...(args.multiContent || {}) };
        if (args.content) {
          content['application/json'] = args.content;
        }
        if (Object.keys(content).length === 0) {
          content['application/json'] = inferSchema(parameterType, modelsToParse);
        }

        requestBody.content =
          _.fromPairs(_.toPairs(content)
            .map(t => {
              const mt: O3TS.MediaTypeObject = { schema: parseSchemaLike(t[1], modelsToParse) };
              return [t[0], mt];
            }));

        Reflect.defineMetadata(OPENAPI_REQUEST_INDEX, parameterIndex, target, propertyKey);
        Reflect.defineMetadata(OPENAPI_REQUEST_BODY, requestBody, target, propertyKey);
        return NestBody(...(opts.pipes || []))(target, propertyKey, parameterIndex);
      });
    };
}

export interface BaseParamArgs {
  name?: string;
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: SchemaLike;
}

export interface PathArgs extends BaseParamArgs {
  style?: 'simple' | 'matrix' | 'label';
}

export interface PathOpts {
  pipes?: Array<Type<PipeTransform> | PipeTransform>;
}

/**
 * Performs the moral equivalent of NestJS's `@Param` (by default) to extract a
 * parameter from `req.params`. It is renamed to `Path` for clarity.
 *
 * **WARNING:** This has not been built to work with any style other than
 * `simple`.
 *
 * `TODO:` Handle path styles correctly (good contribution opportunity!)
 *
 * @param name The path parameter to extract
 * @param args
 * @param opts
 */
export function Path(name: string, args: PathArgs = {}, opts: PathOpts = {}): ParameterDecorator {
  return (target: object, propertyKey: string | symbol, parameterIndex: number) => {
    baseParameterHandler('Param', target, propertyKey, parameterIndex,
      (parameterMetadata, parameterType, modelsToParse) => {
        const parameter: O3TS.ParameterObject = {
          ...args,
          name,
          in: 'path',
          required: true,
          schema:
            args.schema
              ? parseSchemaLike(args.schema, modelsToParse)
              : inferSchema(parameterType, modelsToParse),
        };

        addToMapMetadata<number, O3TS.ParameterObject>(OPENAPI_PARAMETER_BY_INDEX, parameterIndex, parameter, target, propertyKey);
        mergeObjectMetadata(OPENAPI_PARAMETER, { [name]: parameter }, target, propertyKey);
        return NestParam(name, ...(opts.pipes || []))(target, propertyKey, parameterIndex);
      });
  };
}

export interface QueryArgs extends BaseParamArgs {
  allowEmptyValue?: boolean;
  allowReserved?: boolean;
  style?: 'form' | 'spaceDelimited' | 'pipeDelimited' | 'deepObject';
}

export interface QueryOpts {
  pipes?: Array<Type<PipeTransform> | PipeTransform>;
}

/**
 * Performs the moral equivalent of NestJS's `@Query` (by default) to extract a
 * parameter from `req.query`.
 *
 * **WARNING:** This has not been built to work with any style other than
 * `form`.
 *
 * `TODO:` Handle query styles correctly (good contribution opportunity!)
 *
 * @param name The name of the query to inject
 * @param args
 * @param opts
 */
export function Query(name: string, args: QueryArgs = {}, opts: QueryOpts = {}): ParameterDecorator {
  return (target: object, propertyKey: string | symbol, parameterIndex: number) => {
    baseParameterHandler('Query', target, propertyKey, parameterIndex,
      (parameterMetadata, parameterType, modelsToParse) => {
        const parameter: O3TS.ParameterObject = {
          ...args,
          name,
          in: 'query',
          schema:
            args.schema
              ? parseSchemaLike(args.schema, modelsToParse)
              : inferSchema(parameterType, modelsToParse),
        };

        // const fetchDecorator =
        //   (!parameter.schema || opts.skipConvert)
        //     ? createParamDecorator((data, req) => req.query[name])
        //     : createValidatingRequestDecorator((req) => req.query[name], parameter.schema);

        addToMapMetadata<number, O3TS.ParameterObject>(OPENAPI_PARAMETER_BY_INDEX, parameterIndex, parameter, target, propertyKey);
        mergeObjectMetadata(OPENAPI_PARAMETER, { [name]: parameter }, target, propertyKey);
        return NestQuery(name, ...(opts.pipes || []))(target, propertyKey, parameterIndex);
      });
  };
}

export interface HeaderArgs extends BaseParamArgs {
  style?: 'simple';
}

export interface HeaderOpts {
}

/**
 * Fetches a value from a header while recording the header parameter in your OpenAPI
 * document.
 *
 * @param name The header to inject
 * @param args
 * @param opts
 */
export function Header(name: string, args: HeaderArgs = {}, opts: HeaderOpts = {}) {
  return (target: object, propertyKey: string | symbol, parameterIndex: number) => {
    baseParameterHandler('Header', target, propertyKey, parameterIndex,
      (parameterMetadata, parameterType, modelsToParse) => {
        const parameter: O3TS.ParameterObject = {
          ...args,
          name,
          in: 'header',
          schema:
            args.schema
              ? parseSchemaLike(args.schema, modelsToParse)
              : inferSchema(parameterType, modelsToParse),
        };

        // const fetchDecorator =
        //   (!parameter.schema || opts.skipConvert)
        //     ? createParamDecorator((data, req) => req.header(name))
        //     : createValidatingRequestDecorator((req) => req.header(name), parameter.schema);

        addToMapMetadata<number, O3TS.ParameterObject>(OPENAPI_PARAMETER_BY_INDEX, parameterIndex, parameter, target, propertyKey);
        mergeObjectMetadata(OPENAPI_PARAMETER, { [name]: parameter }, target, propertyKey);
        return NestHeaders(name)(target, propertyKey, parameterIndex);
      });
  };
}
