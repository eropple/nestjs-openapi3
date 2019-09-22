import * as O3TS from 'openapi3-ts';

import { Ctor } from './types';

export function schemaReference(referred: string | Ctor<any>): O3TS.ReferenceObject {
  const name = typeof(referred) === 'function' ? referred.name : referred;
  return { $ref: `#/components/schemas/${name}` };
}
