import { ScalarPropArgs } from '../types';

/**
 * Spread (`...OAS.propPrefabs.uuid`) these into your `@OAS.Prop` calls or type annotations
 * to handle some basic stuff a little more easily.
 */
export const propPrefabs: { [key: string]: ScalarPropArgs } = {
  uuid: {
    type: 'string',
    pattern: '^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$',
  },
  date: {
    type: 'string',
    format: 'date',
  },
  dateTime: {
    type: 'string',
    format: 'date-time',
  },
};
