import Ajv from 'ajv';
import * as O3TS from 'openapi3-ts';
import { BadRequestException } from '@nestjs/common';

export function parseViaSchema(
  ajv: Ajv.Ajv,
  validator: Ajv.ValidateFunction,
  value: unknown,
) {
  const valid = validator(value);

  if (!valid) {
    const errors = ajv.errors;
    throw new BadRequestException('Invalid request.', ajv.errorsText(errors));
  }

  return value;
}
