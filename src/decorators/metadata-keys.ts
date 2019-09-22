const PREFIX = '@eropple/nestjs-openapi';

/**
 * HTTP method. Comes from NestJS, so no prefixing.
 */
export const METHOD = 'method';
/**
 * HTTP path. Comes from NestJS, so no prefixing.
 */
export const PATH = 'path';

export const OPENAPI_IGNORE = `${PREFIX}:Operation:Ignore`;
export const OPENAPI_OPERATION_INFO = `${PREFIX}:Operation:OperationInfo`;
export const OPENAPI_TAGS = `${PREFIX}:Operation:Tags`;
export const OPENAPI_DEPRECATED = `${PREFIX}:Operation:Deprecated`;
export const OPENAPI_SECURITY_SCHEMES = `${PREFIX}:Operation:SecurityScheme`;
export const OPENAPI_PARAMETER = `${PREFIX}:Operation:Parameter`;
export const OPENAPI_PARAMETER_BY_INDEX = `${OPENAPI_PARAMETER}:ByIndex`;
export const OPENAPI_PARAMETER_PROPERTY_KEYS = `${PREFIX}:Operation:ParameterPropertyKeys`;
export const OPENAPI_REQUEST_BODY = `${PREFIX}:Operation:RequestBody`;
export const OPENAPI_REQUEST_INDEX = `${OPENAPI_REQUEST_BODY}:Index`;

export const OPENAPI_INTERNAL_MODELS_TO_PARSE = `${PREFIX}:Internal:ModelsToParse`;

export const OPENAPI_MODEL_RAW = `${PREFIX}:Models:Raw`;
export const OPENAPI_MODEL_BASE = `${PREFIX}:Models:Base`;
export const OPENAPI_MODEL_PROP_RAW = `${PREFIX}:Models:Prop:Raw`;
export const OPENAPI_MODEL_PROP = `${PREFIX}:Models:Prop`;
export const OPENAPI_MODEL_PROP_ARRAY = `${PREFIX}:Models:PropArray`;
export const OPENAPI_MODEL_PROP_REQUIRED = `${PREFIX}:Models:Prop:Required`;
