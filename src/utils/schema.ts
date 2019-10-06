import * as O3TS from 'openapi3-ts';
import * as _ from 'lodash';

import { Ctor, SchemaLike, ScalarPropArgs, ArrayPropArgs, SimpleResponseWithSchemaLike } from '../types';
import {
  OPENAPI_MODEL_RAW,
  OPENAPI_MODEL_BASE,
  OPENAPI_MODEL_PROP_REQUIRED,
  OPENAPI_MODEL_PROP_RAW,
  OPENAPI_MODEL_PROP_ARRAY,
  OPENAPI_MODEL_PROP,
} from '../decorators/metadata-keys';
import { schemaReference } from '../references';
import { getAllMetadata, getAllParameterMetadata } from './metadata';
import { ModelBaseInfo } from '../decorators';
import { InferenceError } from '../errors';
import { isReferenceObject, isSchemaObject } from 'openapi3-ts';

export function parseSchemaLike(c: SchemaLike, modelsToParse: Array<Ctor>): O3TS.SchemaObject | O3TS.ReferenceObject {
  // It's important to note that this method DOES have a side effect: it
  // adds any found models to `modelsToParse`.

  if (typeof(c) === 'function') {
    return inferSchema(c, modelsToParse);
  } else if (Array.isArray(c)) {
    return { type: 'array', items: parseSchemaLike(c[0], modelsToParse) };
  } else if (isReferenceObject(c)) {
    return c;
  } else { // O3TS.SchemaObjects, but potentially with deeper schemaLikes.
    const ret: O3TS.SchemaObject = {
      ...c,
    };

    if (c.allOf) {
      ret.allOf = c.allOf.map(sub => parseSchemaLike(sub, modelsToParse));
    }

    if (c.anyOf) {
      ret.anyOf = c.anyOf.map(sub => parseSchemaLike(sub, modelsToParse));
    }

    if (c.oneOf) {
      ret.oneOf = c.oneOf.map(sub => parseSchemaLike(sub, modelsToParse));
    }

    return ret;
  }
}

/**
 * Handles primitive inference, as best as we can. This is used for looking at the
 * minimal type information that TypeScript provides us and trying to guess what a
 * property or argument actually _is_. This is not a highly effective way to do this,
 * but we're limited in what we have access to.
 *
 * Like many methods in our inference system, this one expects that it will be passed
 * an array to which it can append unrecognized types. As a rule: if it's not a
 *
 * @param type The type to introspect (as best we can)
 * @param modelsToParse A list of models that need to be examined to make this schema work.
 */
export function inferSchema(
  type: any,
  modelsToParse: Array<Ctor>,
): O3TS.SchemaObject | O3TS.ReferenceObject {
  switch (type) {
    case Number:
      return { type: 'number' };
    case String:
      return { type: 'string' };
    case Date:
      return { type: 'string', format: 'date' };
    case Boolean:
      return { type: 'boolean' };
    case Array:
      throw new InferenceError(
        'Array received as a type in inferSchema. This usually happens ' +
        'in OpenAPI response definitions because the module is trying to ' +
        'parse a parameter or return value that is an Array; since TypeScript ' +
        'erases generic type information at runtime, you will need to ' +
        'explicitly specify schema information wherever you are receiving ' +
        'this error.',
      );
    case Promise:
      throw new InferenceError(
        'Promise received as a type in inferSchema. This usually happens ' +
        'in OpenAPI response definitions because the OpenAPI module is ' +
        'trying to make sense of an async function; since TypeScript ' +
        'erases generic type information at runtime, you will need to ' +
        'explicitly specify schema information wherever you are receiving ' +
        'this error.',
      );
    case Object:
      throw new InferenceError(
        'Object received as a type in inferSchema. TypeScript provides ' +
        'Object when it runs into union types or other types that cannot ' +
        'be cleanly expressed in terms of JavaScript constructor functions; ' +
        'you should provide explicit schema information instead of relying ' +
        'on inference.',
      );
    default:
      modelsToParse.push(type);
      return schemaReference(type);
      break;
  }
}

export function buildSchemaFromAnnotatedType(type: Ctor, modelsToParse: Array<Ctor>): O3TS.SchemaObject {
  const typeMetadata = getAllMetadata(type);

  if (typeMetadata[OPENAPI_MODEL_RAW]) {
    return typeMetadata[OPENAPI_MODEL_RAW];
  }

  const modelBaseInfo: ModelBaseInfo | undefined = typeMetadata[OPENAPI_MODEL_BASE];
  if (!modelBaseInfo) {
    throw new Error(`Type '${type.name}' lacks @ModelRaw or @Model annotation.`);
  }

  const schema: O3TS.SchemaObject = {
    ...modelBaseInfo,
    type: 'object',
    properties: {},
  };

  // TODO:  this fails inheritance
  //        I am probably dense, but `Object.keys()` isn't giving back
  //        the same set of property names. If this is inherited from
  //        another model, it'll probably act unexpectedly.
  const propNames =
    Object.getOwnPropertyNames(type.prototype)
          .filter(c => c !== 'constructor');

  for (const propName of propNames) {
    buildSchemaFromAnnotatedProp(
      schema,
      propName,
      getAllParameterMetadata(type.prototype, propName),
      modelsToParse,
    );
  }

  return schema;
}

function buildSchemaFromAnnotatedProp(
  schema: O3TS.SchemaObject,
  propName: string,
  propMetadata: _.Dictionary<any>,
  modelsToParse: Array<Ctor>,
) {
  const type = propMetadata['design:type'];

  const rawProp: O3TS.SchemaObject | undefined = propMetadata[OPENAPI_MODEL_PROP_RAW];
  const normalProp: ScalarPropArgs | undefined = propMetadata[OPENAPI_MODEL_PROP];
  const arrayProp: ArrayPropArgs | undefined = propMetadata[OPENAPI_MODEL_PROP_ARRAY];

  const isProp = !!rawProp || !!normalProp || !!arrayProp;
  const required = propMetadata[OPENAPI_MODEL_PROP_REQUIRED];

  if (isProp) {
    let propSchema: O3TS.SchemaObject | O3TS.ReferenceObject;

    if (rawProp) {
      propSchema = rawProp;
    } else if (normalProp) {
      const inferred =
        (!normalProp.type && !normalProp.format)
          ? inferSchema(type, modelsToParse)
          : {};

      propSchema = { ...normalProp, ...inferred };

      if (propSchema.$ref && Object.keys(propSchema).length > 1) {
        (propSchema as O3TS.SchemaObject).oneOf = [{ $ref: propSchema.$ref }];
        delete propSchema.$ref;
      }
    } else if (arrayProp) {
      propSchema = {
        ...arrayProp,
        type: 'array',
        items: parseSchemaLike(arrayProp.items, modelsToParse),
      };
    } else {
      throw new Error('fencepost: cannot reach.');
    }

    if (required) {
      schema.required = schema.required || [];
      schema.required.push(propName);
    }

    schema.properties![propName] = propSchema;
  }
}

export function prepareResponsesFromSchemaLikes(
  responses: { [code: string]: SimpleResponseWithSchemaLike },
  returnType: any,
  modelsToParse: Array<Ctor>,
): { [code: string]: O3TS.ResponseObject } {
  return _.fromPairs(
    _.toPairs(responses)
      .map(t => {
        const sr = t[1];
        const schemaLikeContent: { [mediaType: string]: SchemaLike } = { ...(sr.multiContent || {}) };
        if (sr.content) {
          schemaLikeContent['application/json'] = sr.content;
        }
        if (returnType && Object.keys(schemaLikeContent).length === 0) {
          schemaLikeContent['application/json'] = inferSchema(returnType, modelsToParse);
        }

        const mediaTypeContent =
          _.fromPairs(
            _.toPairs(schemaLikeContent)
              .map(kv => {
                return [kv[0], { schema: parseSchemaLike(kv[1], modelsToParse) }];
              }));

        const fixedResponse: O3TS.ResponseObject = {
          ...t[1],
          description: t[1].description || 'No description given.',
          content: mediaTypeContent,
        };

        // this is silly, but it patches up the object correctly for multi-content
        delete (fixedResponse as any).multiContent;
        return [t[0], fixedResponse];
      }));
}
