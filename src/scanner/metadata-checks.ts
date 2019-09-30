import _ from 'lodash';

import * as O3TS from 'openapi3-ts';

import {
  PATH,
  OPENAPI_TAGS,
  OPENAPI_DEPRECATED,
  OPENAPI_OPERATION_INFO,
  OPENAPI_PARAMETER,
  OPENAPI_REQUEST_BODY,
  OPENAPI_INTERNAL_MODELS_TO_PARSE,
  OPENAPI_SECURITY_SCHEMES,
  OPENAPI_IGNORE,
} from '../decorators/metadata-keys';
import {
  AnyOperationInfo,
  OperationInfo,
  BaseOperationInfo,
} from './operation-info';

type MetadataFn = (metadata: { [k: string]: any }, opInfo: AnyOperationInfo) => void;
type EndpointMetadataFn = (metadata: { [k: string]: any }, opInfo: OperationInfo) => void;

export function checkParentMetadata(metadata: { [k: string]: any }, baseOpInfo: BaseOperationInfo) {
  checkIgnore(metadata, baseOpInfo);
  if (baseOpInfo.ignore) {
    return;
  }

  checkTags(metadata, baseOpInfo);
  checkParameters(metadata, baseOpInfo);
  checkPathChunks(metadata, baseOpInfo);
  checkDeprecated(metadata, baseOpInfo);
  checkSecuritySchemes(metadata, baseOpInfo);
  checkModels(metadata, baseOpInfo);
}

export function checkEndpointMetadata(metadata: { [k: string]: any }, opInfo: OperationInfo) {
  checkIgnore(metadata, opInfo);
  if (opInfo.ignore) {
    return;
  }

  checkOperationInfo(metadata, opInfo);
  checkParameters(metadata, opInfo);
  checkPathChunks(metadata, opInfo);
  checkTags(metadata, opInfo);
  checkDeprecated(metadata, opInfo);
  checkSecuritySchemes(metadata, opInfo);
  checkModels(metadata, opInfo);
}

export function checkEndpointArgumentMetadata(metadata: { [k: string]: any }, opInfo: OperationInfo) {
  checkRequestBody(metadata, opInfo);
  checkParameters(metadata, opInfo);
  checkSecuritySchemes(metadata, opInfo);
  checkModels(metadata, opInfo);
}

const checkIgnore: MetadataFn = (m: { [k: string]: any }, op: AnyOperationInfo) => {
  if (m[OPENAPI_IGNORE]) {
    op.ignore = m[OPENAPI_IGNORE];
  }
};

const checkPathChunks: MetadataFn = (m: { [k: string]: any }, op: AnyOperationInfo) => {
  if (m[PATH]) {
    op.pathChunks.push(m[PATH]);
  }
};

const checkDeprecated: MetadataFn = (m: { [k: string]: any }, op: AnyOperationInfo) => {
  if (m[OPENAPI_DEPRECATED]) {
    op.deprecated = m[OPENAPI_DEPRECATED];
  }
};

const checkTags: MetadataFn = (m: { [k: string]: any }, op: AnyOperationInfo) => {
  if (m[OPENAPI_TAGS]) {
    op.tags = _.flattenDeep([...op.tags, m[OPENAPI_TAGS]]);
  }
};

const checkSecuritySchemes: MetadataFn = (m: { [k: string]: any }, op: AnyOperationInfo) => {
  if (m[OPENAPI_SECURITY_SCHEMES]) {
    op.securitySchemes = { ...op.securitySchemes, ...m[OPENAPI_SECURITY_SCHEMES] };
  }
};


const checkParameters: MetadataFn = (m: { [k: string]: any }, op: AnyOperationInfo) => {
  if (m[OPENAPI_PARAMETER]) {
    op.parameters = { ...op.parameters, ...m[OPENAPI_PARAMETER] };
  }
};

const checkRequestBody: EndpointMetadataFn = (m: { [k: string]: any }, op: OperationInfo) => {
  if (m[OPENAPI_REQUEST_BODY]) {
    op.requestBody = m[OPENAPI_REQUEST_BODY];
  }
};

const checkModels: MetadataFn = (m: { [k: string]: any }, op: AnyOperationInfo) => {
  if (m[OPENAPI_INTERNAL_MODELS_TO_PARSE]) {
    op.modelsToParse = [ ...op.modelsToParse, ...m[OPENAPI_INTERNAL_MODELS_TO_PARSE] ];
  }
};

const checkOperationInfo: EndpointMetadataFn = (m: { [k: string]: any }, op: OperationInfo) => {
  const info: Partial<O3TS.OperationObject> | undefined = m[OPENAPI_OPERATION_INFO];
  if (info) {
    Object.assign(op, info);
  }
};
