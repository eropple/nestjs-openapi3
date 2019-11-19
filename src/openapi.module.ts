import { NestApplication, NestContainer } from '@nestjs/core';
import { INestApplication, HttpServer } from '@nestjs/common';
import { LoggerLike, bunyanize, BunyanLike } from '@eropple/bunyan-wrapper';
import { Request, Response } from 'express';
import * as O3TS from 'openapi3-ts';
import * as FS from 'fs';
import { findUp } from '@eropple/find-up';

import { scan, ScanOptions } from './scanner';
import { ArchaeologyFailedError } from './errors';
import { OpenapiBuilder } from './builder';
import { validate } from './validate';
import { OpenapiValidationInterceptor } from './openapi-validation.interceptor';
import { SimpleResponseWithSchemaLike, ValidationFailedResponseBuilder } from './types';

const RAPIDOC_VERSION = '5.3.0';

export type OpenapiBuilderConfigFn = (b: OpenapiBuilder) => void;

export interface OpenapiModuleCreateDocumentArgs {
  /**
   * The NestJS application to explore to generate the OpenAPI document.
   */
  app: INestApplication;
  /**
   * Logger that the module should use to emit information, warnings, and errors.
   */
  baseLogger?: LoggerLike;
  /**
   * The set of responses that should be applied to every endpoint. This _does
   * not_ ensure that these responses _are_ sent; you should write a conformant
   * error filter that does that.
   */
  defaultResponses?: { [code: string]: SimpleResponseWithSchemaLike };
}
export interface OpenapiModuleAttachArgs extends OpenapiModuleCreateDocumentArgs {
  /**
   * Optionally-provided OpenAPI document. Useful if you've created your
   * document already with `OpenapiModule.createDocument` and just need to
   * stand it up in your application container now.
   */
  document?: O3TS.OpenAPIObject;
  /**
   * If `true`, do not serve the OpenAPI document at `/openapi.json`. This
   * implies `skipApiServing = true`.
   */
  skipJsonServing?: boolean;
  /**
   * If `true`, do not serve the Swagger editor at `/api-docs`. Will be replaced
   * by `apiDocs: null` in `0.5.0.
   *
   * @deprecated
   */
  skipApiServing?: boolean;
  /**
   * Which API documentation system you'd like to use. Defaults to `swagger`.
   * The default will become `rapidoc` in or by `1.0.0`. Set to `null` to serve
   * no API docs.
   */
  apiDocs?: 'swagger' | 'rapidoc' | null;
  basePath?: string;

  /**
   * Used to build the JSON response (it's always `application/json`) when
   * parameters or request bodies fail to pass OpenAPI validation. You can then
   * add `400` and this type into your default responses to make your clients
   * smarter. (It will also emit `415 Unsupported Media Type` errors, but no
   * OpenAPI 3 client will ever see that, so adding it to all responses is
   * probably overkill.)
   */
  validationFailedResponse?: ValidationFailedResponseBuilder;
}

export class OpenapiModule {
  /**
   * Creates and returns an OpenAPI document. Accepts a `fn` argument, as well, that
   * allows customization of the document (via its builder class) before returning
   * it.
   *
   * @param fn Function for customizing the OpenAPI builder before returning.
   */
  static async createDocument(
    {
      app,
      baseLogger,
      defaultResponses,
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

    const scanOptions: ScanOptions = {
      defaultResponses,
    };
    scan(builder, container, logger, scanOptions);

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
      apiDocs,
      basePath,
      validationFailedResponse,
      ...rest
    }: OpenapiModuleAttachArgs,
    fn?: OpenapiBuilderConfigFn,
  ) {
    const logger = bunyanize(baseLogger || console).child({ component: this.name });
    if (apiDocs === undefined) {
      apiDocs = 'swagger';
    }

    if (!document) {
      if (!fn) {
        throw new Error('If a document is not provided to OpenapiModule#attach, a builder function must be.');
      }

      document = await OpenapiModule.createDocument({ app, baseLogger, ...rest }, fn);
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

      if (!skipApiServing && apiDocs !== null) {
        switch (apiDocs) {
          case 'swagger':
            this.serveSwagger(document, apiDocsPath, logger, app, httpAdapter);
            break;
          case 'rapidoc':
              this.serveRapidoc(document, apiDocsPath, logger, httpAdapter);
              break;
        }
      }
    }

    app.useGlobalInterceptors(new OpenapiValidationInterceptor(document, validationFailedResponse));
  }

  private static serveSwagger(
    document: O3TS.OpenAPIObject,
    apiDocsPath: string,
    logger: BunyanLike,
    app: INestApplication,
    httpAdapter: HttpServer<any, any>,
  ) {
    try {
      // tslint:disable-next-line: no-require-imports
      const swaggerUi = require('swagger-ui-express');

      const html = swaggerUi.generateHTML(document, {});

      app.use(apiDocsPath, swaggerUi.serveFiles(document, {}));
      httpAdapter.get(apiDocsPath, (req, res) => res.contentType('html').send(html));

    } catch (err) {
      logger.warn({ err }, 'Error when loading `swagger-ui-express`. Make sure you have it in your package.json.');
    }
  }

  private static serveRapidoc(
    document: O3TS.OpenAPIObject,
    apiDocsPath: string,
    logger: BunyanLike,
    httpAdapter: HttpServer<any, any>,
  ) {
    try {
      const assetPath = `${findUp(__dirname, 'assets', { searchFor: 'directories' })}/rapidoc-${RAPIDOC_VERSION}-min.js`;

      const rapidocHtml = `
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body>
          <rapi-doc
            id="RAPIDOC"
            regular-font="Roboto, Calibri, 'Helvetica Neue', Helvetica, Arial, sans-serif"
            mono-font="'Roboto Mono', Consolas,  Monaco, monospace"
          ></rapi-doc>
          <script type="module">
            ${FS.readFileSync(assetPath, { encoding: 'utf8' })}
          </script>
          <script>
            document.addEventListener('DOMContentLoaded', (event) => {
              window.docEl = document.getElementById("RAPIDOC");
              window.specText = \`${JSON.stringify(document)}\`;
              window.spec = JSON.parse(window.specText);
              window.docEl.loadSpec(spec);
            });
          </script>
        </body>
        </html>
      `;

      httpAdapter.get(apiDocsPath, (req, res) => res.contentType('html').send(rapidocHtml));
    } catch (err) {
      logger.warn({ err }, 'Error when adding RapiDoc.');
    }
  }
}
