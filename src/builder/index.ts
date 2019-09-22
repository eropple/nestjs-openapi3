import * as _ from 'lodash';

import * as OpenapiTS from 'openapi3-ts';

import { Ctor } from '../types';
import { OperationAlreadyExistsError } from './errors';
import { buildSchemaFromAnnotatedType } from '../utils';

/**
 * Due to the way the JSON Schema converter works, we have to hold hands and do
 * some trust exercises around building paths. But only so many.
 *
 * This intentionally omits `trace`, even though OpenAPI supports it, because
 * NestJS doesn't, and `options`, because requesting that directly is incoherent.
 */
export type OperationMethod = 'get' | 'put' | 'post' | 'delete' | 'head' | 'patch';

export class OpenapiBuilder extends OpenapiTS.OpenApiBuilder {
  constructor(doc?: OpenapiTS.OpenAPIObject) {
    super(doc);
  }

  addOperation(path: string, method: OperationMethod, operation: OpenapiTS.OperationObject) {
    let currentPathItem = (this.rootDoc.paths as any)[path];
    if (!currentPathItem) {
      this.addPath(path, {});
    }

    currentPathItem = (this.rootDoc.paths as any)[path];

    const currentOperation: OpenapiTS.OperationObject | undefined = currentPathItem[method];
    if (currentOperation) {
      throw new OperationAlreadyExistsError(`${method.toUpperCase()} ${path}`);
    }

    currentPathItem[method] = operation;
    return this;
  }

  ensureSchemaFromType(t: Ctor) {
    const name = t.name;
    if (this.rootDoc.components && this.rootDoc.components.schemas && this.rootDoc.components.schemas[name]) {
      return;
    }

    const modelsToParse: Array<Ctor> = [];
    this.addSchema(name, buildSchemaFromAnnotatedType(t, modelsToParse));

    for (const modelToParse of modelsToParse) {
      this.ensureSchemaFromType(modelToParse);
    }
  }

  static create(): OpenapiBuilder {
    return new OpenapiBuilder();
  }
}
