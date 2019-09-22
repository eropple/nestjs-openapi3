import * as O3TS from 'openapi3-ts';

import { SetMetadata } from '../utils';
import {
  OPENAPI_MODEL_RAW,
  OPENAPI_MODEL_BASE,
  OPENAPI_MODEL_PROP_RAW,
  OPENAPI_MODEL_PROP_REQUIRED,
  OPENAPI_MODEL_PROP,
  OPENAPI_MODEL_PROP_ARRAY,
} from './metadata-keys';
import { ArrayPropArgs, ScalarPropArgs } from '../types';

/**
 * The "nuclear option" for schema definition. If for some reason you
 * are running into persistent issues with schema definition based on
 * our schema exploration tool, you may use `ModelRaw` to explicitly
 * define the entirety of an OpenAPI schema. When this decorator is
 * used, _all other information_ on the object is completely ignored.
 *
 * Please note that this includes any references within this schema.
 * You will need to make sure that the `OpenapiBuilder` has the proper
 * schema added to it.
 *
 * @param schema A full OpenAPI schema to use for this model.
 */
export const ModelRaw = (schema: O3TS.SchemaObject) =>
  SetMetadata({ [OPENAPI_MODEL_RAW]: schema });

/**
 * Similar to `ModelRaw`, `PropRaw` allows you to cut out all schema
 * exploration for this property and to specify its details in full.
 *
 * @param schema a full OpenAPI schema to use for this property.
 * @param opts Parent-level indicators, such as required status.
 * @see ModelRaw
 */
export const PropRaw =
  (schema: O3TS.SchemaObject | O3TS.ReferenceObject,
   opts: { required: boolean } = { required: true }) =>
    SetMetadata({
      [OPENAPI_MODEL_PROP_RAW]: schema,
      [OPENAPI_MODEL_PROP_REQUIRED]: opts.required,
    });

export interface ModelBaseInfo {
  title?: string;
  description?: string;
  externalDocs?: O3TS.ExternalDocumentationObject;
  deprecated?: boolean;
}
/**
 * Defines a model (schema) in OpenAPI-land. Accepts a number of aspects of a
 * schema that apply chiefly at the "top level" of that schema; these will be
 * passed verbatim into the OpenAPI document.
 *
 * @param schemaInfo
 */
export const Model = (schemaInfo: ModelBaseInfo = {}) =>
  SetMetadata({ [OPENAPI_MODEL_BASE]: schemaInfo });

/**
 * Indicates that a property on the model should be included in the schema. (It
 * is mostly not our fault that this must be added to every property you care
 * about; TypeScript doesn't offer much help with complex types!)
 */
export const Prop =
  (args: ScalarPropArgs = {}, opts: { required: boolean } = { required: true },
  ) => SetMetadata({
    [OPENAPI_MODEL_PROP]: args,
    [OPENAPI_MODEL_PROP_REQUIRED]: opts.required,
  });

/**
 * Defines a property that is an array. As arrays' generic type information is
 * erased at runtime, you're going to have to be specific about the contents of
 * the array.
 */
export const ArrayProp = (args: ArrayPropArgs) =>
  SetMetadata({ [OPENAPI_MODEL_PROP_ARRAY]: args });

