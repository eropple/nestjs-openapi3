export * from './metadata';
export * from './schema';
export * from './argument-parsing';
export * from './schema';
export * from './prop-prefabs';

const methodConstants: Array<[number, string]> = [
  [0, 'get'],
  [1, 'post'],
  [2, 'put'],
  [3, 'delete'],
  [4, 'patch'],
  [6, 'options'],
  [7, 'head'],
];

export const MethodIntToString: ReadonlyMap<number, string> = new Map<number, string>(methodConstants);

export const MethodStringToInt: ReadonlyMap<string, number> = new Map<string, number>(
  methodConstants.map(t => [t[1], t[0]]),
);
