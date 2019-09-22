import * as O3TS from 'openapi3-ts';

import { Ctor } from '../types';

/**
 * Modules, controllers, etc. cascade configuration data down to their endpoints.
 * This just acts as a holder.
 */
export interface BaseOperationInfo {
  tags: Array<string>;
  pathChunks: Array<string>;
  deprecated?: boolean;
  parameters: { [k: string]: O3TS.ParameterObject };
  modelsToParse: Array<Ctor<any>>;
  securitySchemes: { [schemeName: string]: Array<string> };
}

export interface OperationInfo extends BaseOperationInfo {
  nestMethodIndex: number;
  name: string;
  summary?: string;
  description?: string;
  externalDocs?: O3TS.ExternalDocumentationObject;
  requestBody?: O3TS.RequestBodyObject;
  responses: O3TS.ResponsesObject;
}

export type AnyOperationInfo = BaseOperationInfo | OperationInfo;
