import { NestApplication, NestContainer } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { LoggerLike, bunyanize } from '@eropple/bunyan-wrapper';
import * as O3TS from 'openapi3-ts';
import { Request, Response } from 'express';

import { scan } from './scanner';
import { ArchaeologyFailedError } from './errors';
import { OpenapiBuilder } from './builder';
import { validate } from './validate';
import { OpenapiValidationInterceptor } from './openapi-validation.interceptor';

export type OpenapiBuilderConfigFn = (b: OpenapiBuilder) => void;

export interface OpenapiModuleCreateDocumentArgs {
  app: INestApplication;
  baseLogger?: LoggerLike;
}
export interface OpenapiModuleAttachArgs extends OpenapiModuleCreateDocumentArgs {
  document?: O3TS.OpenAPIObject;
  /**
   * If `true`, do not serve the OpenAPI document at `/openapi.json`. This
   * implies `skipApiServing = true`.
   */
  skipJsonServing?: boolean;
  /**
   * If `true`, do not serve the Swagger editor at `/api-docs`.
   */
  skipApiServing?: boolean;
  basePath?: string;
}

export class OpenapiModule {
  static async createDocument(
    {
      app,
      baseLogger,
    }: OpenapiModuleCreateDocumentArgs,
    fn: OpenapiBuilderConfigFn,
  ): Promise<O3TS.OpenAPIObject> {
    const logger = bunyanize(baseLogger || console).child({ component: this.name });
    if (!(app instanceof NestApplication)) {
      throw new ArchaeologyFailedError(`Expected NestApplication (through NestJS 'INestApplication'), got '${app.constructor.name}'.`);
    }

    const container: NestContainer = (app as any).container;
    if (!container) {
      throw new ArchaeologyFailedError('Could not extract NestContainer from app.');
    }

    const builder = OpenapiBuilder.create();
    if (fn) {
      fn(builder);
    } else {
      logger.warn('No builder function passed to OpenapiModule.attach; your OpenAPI document will probably look weird.');
    }

    scan(builder, container, logger);

    const document = builder.getSpec();
    const validationResult = await validate(document);

    if (validationResult.error) {
      logger.error({ err: validationResult.error.toString() }, 'Error when validating OpenAPI document.');
    }

    if (validationResult.warning) {
      logger.warn({ warn: validationResult.warning.toString() }, 'Warning when validating OpenAPI document.');
    }

    return document;
  }

  /**
   *
   * @param app The NestJS application for which to generate an OpenAPI definition.
   */
  static async attach(
    {
      app,
      baseLogger,
      document,
      skipJsonServing,
      skipApiServing,
      basePath,
    }: OpenapiModuleAttachArgs,
    fn?: OpenapiBuilderConfigFn,
  ) {
    const logger = bunyanize(baseLogger || console).child({ component: this.name });

    if (!document) {
      if (!fn) {
        throw new Error('If a document is not provided to OpenapiModule#attach, a builder function must be.');
      }

      document = await OpenapiModule.createDocument({ app, baseLogger }, fn);
    }

    basePath = basePath || '';
    if (basePath[0] === '/') {
      basePath = basePath.substr(1);
    }

    const httpAdapter = app.getHttpAdapter();

    if (!skipJsonServing) {
      const openapiPath = [basePath, 'openapi.json'].join('/');
      const apiDocsPath = [basePath, 'api-docs'].join('/');

      httpAdapter.get(openapiPath,
        (req: Request, res: Response) => res.contentType('json').send(JSON.stringify(document, null, 2)),
      );

      if (!skipApiServing) {
        try {
          // tslint:disable-next-line: no-require-imports
          const swaggerUi = require('swagger-ui-express');

          const swaggerHtml = swaggerUi.generateHTML(document, {});

          app.use(apiDocsPath, swaggerUi.serveFiles(document, {}));
          httpAdapter.get(apiDocsPath, (req, res) => res.contentType('html').send(swaggerHtml));

        } catch (err) {
          logger.warn({ err }, 'Error when loading `swagger-ui-express`. Make sure you have it in your package.json.');
        }
      }
    }

    app.useGlobalInterceptors(new OpenapiValidationInterceptor(document));
  }
}
