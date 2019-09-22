import * as O3TS from 'openapi3-ts';

export type NoArgCtor<T = any> = new() => T;
export type Ctor<T = any> = new(...args: Array<any>) => T;

/**
 * In most places where OpenAPI expects a `SchemaObject` or a
 * `ReferenceObject`, this library attempts to accept a constructor
 * of a class tagged with `@OAS.Model`. These constructors will be
 * unwound into reference objects and the `OpenapiBuilder` will
 * record the type as one that needs to be processed later.
 */
export type SchemaLike = O3TS.SchemaObject | O3TS.ReferenceObject | Ctor;
export type AllPropProperties =
  'nullable';

export type ScalarPropProperties =
  | 'type'
  | 'format'
  | 'allOf'
  | 'anyOf'
  | 'oneOf'
  | 'not'
  | 'pattern'
  | 'multipleOf'
  | 'maximum'
  | 'minimum'
  | 'exclusiveMaximum'
  | 'exclusiveMinimum'
  | 'enum'
  | 'properties'
  | 'additionalProperties'
  | 'default';
export type ScalarPropArgs =
  Pick<O3TS.SchemaObject, AllPropProperties> &
  Pick<O3TS.SchemaObject, ScalarPropProperties>;

export type ArrayPropProperties =
  | 'uniqueItems'
  | 'minItems'
  | 'maxItems';
export type ArrayPropArgs =
  & Pick<O3TS.SchemaObject, AllPropProperties>
  & Pick<O3TS.SchemaObject, ArrayPropProperties>
  & { items: SchemaLike };

export interface SimpleContentWithSchemaLike {
  content?: SchemaLike;
  multiContent?: { [mediaType: string]: SchemaLike };
}

export interface RequestBodyWithSchemaLike extends SimpleContentWithSchemaLike {
  description?: string;
  required?: boolean;
}

export type HeaderWithSchemaLike =
  O3TS.HeaderObject | { schema: SchemaLike };

export type MediaTypeWithSchemaLike =
  O3TS.MediaTypeObject | { schema: SchemaLike };

// tslint:disable-next-line: interface-over-type-literal
export type ContentsWithSchemaLike =
  { [mediatype: string]: MediaTypeWithSchemaLike };

export interface SimpleResponseWithSchemaLike extends SimpleContentWithSchemaLike {
  description?: string;
}

export interface OperationInfoArgs {
  summary?: string;
  deprecated?: boolean;
  description?: string;
  externalDocs?: O3TS.ExternalDocumentationObject;
  response?: SimpleResponseWithSchemaLike;
  responses?: { [statusCode: string]: SimpleResponseWithSchemaLike };
}
