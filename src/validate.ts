import * as O3TS from 'openapi3-ts';

// tslint:disable-next-line: no-var-requires no-require-imports
const Enforcer = require('openapi-enforcer');

export interface ValidateResult {
  error?: Error;
  warning?: Error;
}

export async function validate(document: O3TS.OpenAPIObject): Promise<ValidateResult> {
  const result = await Enforcer(document, { fullResult: true });
  return { error: result.error, warning: result.warning };
}
