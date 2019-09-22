import { NestContainer } from '@nestjs/core';
import { Module } from '@nestjs/core/injector/module';
import { Controller } from '@nestjs/common/interfaces';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { BunyanLike } from '@eropple/bunyan-wrapper';
import * as O3TS from 'openapi3-ts';
import _ from 'lodash';
import Voca from 'voca';

import {
  OPENAPI_IGNORE,
} from '../decorators/metadata-keys';
import { OpenapiBuilder, OperationMethod } from '../builder';
import { getAllMetadata, MethodIntToString, getAllParameterMetadata } from '../utils';
import { UnrecognizedNestMethodNumberError } from './errors';
import { BaseOperationInfo, OperationInfo } from './operation-info';
import { checkParentMetadata, checkEndpointMetadata, checkEndpointArgumentMetadata } from './metadata-checks';

export function scan(builder: OpenapiBuilder, container: NestContainer, baseLogger: BunyanLike): OpenapiBuilder {
  const logger = baseLogger.child({ phase: 'scan' });
  logger.debug('Initializing application scan.');

  const modules = container.getModules().values();
  for (const mod of modules) {
    scanModule(builder, mod, logger);
  }

  return builder;
}

function scanModule(builder: OpenapiBuilder, mod: Module, baseLogger: BunyanLike) {
  const logger = baseLogger.child({ module: mod.instance.constructor.name });
  logger.trace(`Scanning module '${mod.instance.constructor.name}'.`);

  const moduleMetadata = getAllMetadata(mod.metatype);
  logger.trace({ metadata: moduleMetadata }, `Module metadata for '${mod.instance.constructor.name}'.`);

  const baseOpInfo: BaseOperationInfo = {
    tags: [],
    pathChunks: [],
    parameters: {},
    modelsToParse: [],
    securitySchemes: {},
  };

  checkParentMetadata(moduleMetadata, baseOpInfo);

  for (const controller of mod.controllers.values()) {
    scanController(builder, controller, baseOpInfo, logger);
  }
}

function scanController(
  builder: OpenapiBuilder,
  controllerWrapper: InstanceWrapper<Controller>,
  baseOpInfo: BaseOperationInfo,
  baseLogger: BunyanLike,
) {
  const { metatype } = controllerWrapper;

  const logger = baseLogger.child({ controller: metatype.name });
  logger.trace(`Scanning controller '${controllerWrapper.name}'.`);

  const controllerMetadata = getAllMetadata(metatype);
  logger.trace({ metadata: controllerMetadata }, `Controller metadata for '${metatype.name}'.`);

  const newBaseOpInfo = _.cloneDeep(baseOpInfo);

  checkParentMetadata(controllerMetadata, newBaseOpInfo);

  const candidates =
    Object.getOwnPropertyNames(metatype.prototype)
      .filter(pn => pn !== 'constructor')
      .map(pn => metatype.prototype[pn])
      .filter(p => typeof(p) === 'function');

  for (const candidate of candidates) {
    scanEndpoint(builder, metatype.prototype, candidate, newBaseOpInfo, logger);
  }
}

function scanEndpoint(
  builder: OpenapiBuilder,
  target: any,
  endpoint: (args: Array<any>) => any,
  baseOpInfo: BaseOperationInfo,
  baseLogger: BunyanLike,
) {
  const logger = baseLogger.child({ endpoint: endpoint.name });
  logger.trace(`Scanning endpoint candidate '${endpoint.name}'.`);

  const endpointMetadata = getAllMetadata(endpoint);
  logger.trace({ metadata: endpointMetadata }, `Endpoint metadata for '${endpoint.name}'.`);

  if (typeof(endpointMetadata.method) !== 'number') {
    logger.trace('No method metadata; cannot be an endpoint. Skipping.');
    return;
  }

  if (endpointMetadata[OPENAPI_IGNORE]) {
    logger.trace('Method has an ignore attribute; skipping.');
    return;
  }

  const opInfo: OperationInfo = {
    ...baseOpInfo,
    name: endpoint.name,
    nestMethodIndex: endpointMetadata.method,
    pathChunks: [ ...baseOpInfo.pathChunks ],
    responses: {},
  };

  checkEndpointMetadata(endpointMetadata, opInfo);

  const argumentMetadata = getAllParameterMetadata(target, endpoint.name);
  checkEndpointArgumentMetadata(argumentMetadata, opInfo);

  const oasOperation: O3TS.OperationObject = {
    tags: opInfo.tags,
    operationId: opInfo.name,
    deprecated: opInfo.deprecated,
    summary: opInfo.summary,
    description: opInfo.description,
    externalDocs: opInfo.externalDocs,
    parameters: Object.values(opInfo.parameters),
    requestBody: opInfo.requestBody,
    responses: opInfo.responses,
    security: [stripNullsAndUndefinedFromObject(opInfo.securitySchemes)],
  };

  for (const modelToParse of opInfo.modelsToParse) {
    builder.ensureSchemaFromType(modelToParse);
  }

  const adjustedPath = convertPathForOpenAPI(opInfo.pathChunks);

  const openapiMethod = MethodIntToString.get(opInfo.nestMethodIndex);
  if (!openapiMethod) {
    throw new UnrecognizedNestMethodNumberError(opInfo.nestMethodIndex.toString());
  }
  builder.addOperation(adjustedPath, openapiMethod as OperationMethod, oasOperation);
}

function convertPathForOpenAPI(pathChunks: Array<string>): string {
  let ret = pathChunks.join('/');
  ret = Voca.trim(ret, '/');

  ret = ret.replace(/:([a-z0-9]+)/gi, (sub, pathName) => {
    return `{${pathName}}`;
  });

  return `/${ret}`;
}

function stripNullsAndUndefinedFromObject(obj: { [k: string]: any }) {
  return _.fromPairs(_.toPairs(obj).filter(t => t[1] !== null && t[1] !== undefined));
}
