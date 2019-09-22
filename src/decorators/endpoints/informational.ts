import _ from 'lodash';

import * as O3TS from 'openapi3-ts';
import { SetMetadata, ExtendArrayMetadata, ExtendObjectMetadata, mergeObjectMetadata, getAllMetadata, getAllParameterMetadata } from '../../utils';
import {
  OPENAPI_DEPRECATED,
  OPENAPI_TAGS,
  OPENAPI_OPERATION_INFO,
  OPENAPI_PARAMETER,
  OPENAPI_IGNORE,
  OPENAPI_SECURITY_SCHEMES,
} from '../metadata-keys';

/**
 * Allows attaching information to an endpoint regarding
 * such attributes as its summary, description, and
 * external documentation.
 *
 * This method is meant for explicitly controlling the OpenAPI
 * output at a deep level; you probably want `@OAS.Post()` and
 * similar methods for ease of use.
 */
export const Operation = (info: Partial<O3TS.OperationObject>) =>
  SetMetadata({ [OPENAPI_OPERATION_INFO]: info });

/**
 * Attaches a tag or list of tags to an endpoint or to all
 * endpoints within this endpoint's controller (or all endpoints
 * in all controllers in a module).
 *
 * @param tags A list of tags to attach to all child endpoints.
 */
export const Tags = (...tags: Array<(string | Array<string>)>) =>
  ExtendArrayMetadata(OPENAPI_TAGS, tags);

/**
 * Marks an endpoint or all endpoints within a controller or
 * module as deprecated.
 *
 * @param v deprecation status (default `true`)
 */
export const Deprecated = (v: boolean = true) =>
  SetMetadata({ [OPENAPI_DEPRECATED]: v });

  /**
   * Omits an endpoint from the OpenAPI document.
   */
export const Ignore = (v: boolean = true) =>
  SetMetadata({ [OPENAPI_IGNORE]: v });

/**
 * Allows for explicitly declaring a parameter for an endpoint. _You probably
 * don't want this most of the time._ It's used to declare a parameter that is
 * used by middlewares, etc. before ever getting to a controller's request
 * handler.
 *
 * The JSON schema for a parameter is overly complex and difficult to work
 * with. As such, the underlying definition you get when converting it to
 * TypeScript is bad; while it's doing its best, you're going to want to look
 * at the parameters definition in the OpenAPI specification to make sure
 * you're doing it right.
 *
 * https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#parameterObject
 *
 * @param p an OpenAPI parameter definition
 */
export const Parameter = (p: O3TS.ParameterObject) =>
  ExtendObjectMetadata(OPENAPI_PARAMETER, { [p.name]: p });

/**
 * Specifies a security scheme for an endpoint (or all endpoints within a
 * controller).
 *
 * @param schemeName The scheme, as named when passed to the `OpenApiBuilder`.
 * @param scopes If this is an OAuth2 or OIDC scheme, the set of scopes needed. Pass `null` to remove this scheme from this operation.
 */
export const SecurityScheme = (schemeName: string, scopes: Array<string> | null = []) =>
  <T>(target: object, propertyKey?: string | symbol) => {
    mergeObjectMetadata(OPENAPI_SECURITY_SCHEMES, { [schemeName]: scopes }, target, propertyKey);
  };
