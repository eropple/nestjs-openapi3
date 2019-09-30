import _ from 'lodash';

export function getAllMetadata(o: any) {
  return _.fromPairs(Reflect.getMetadataKeys(o).map(k => [k, Reflect.getMetadata(k, o)]));
}

export function getAllOwnMetadata(o: any) {
  return _.fromPairs(Reflect.getOwnMetadataKeys(o).map(k => [k, Reflect.getOwnMetadata(k, o)]));
}

export function getAllParameterMetadata(o: any, key: string | symbol) {
  return _.fromPairs(Reflect.getMetadataKeys(o, key).map(k => [k, Reflect.getMetadata(k, o, key)]));
}

export function getAllOwnParameterMetadata(o: any, key: string | symbol) {
  return _.fromPairs(Reflect.getOwnMetadataKeys(o, key).map(k => [k, Reflect.getOwnMetadata(k, o, key)]));
}

export function appendArrayMetadata<V>(
  metadataKey: string,
  metadataValue: V | Array<V>,
  target: any,
  key?: string | symbol,
) {
  const current = (key ? Reflect.getMetadata(metadataKey, target, key) : Reflect.getMetadata(metadataKey, target)) || [];
  const values = _.flattenDeep<V>([ current, metadataValue ]);

  if (key) {
    Reflect.defineMetadata(metadataKey, values, target, key);
  } else {
    Reflect.defineMetadata(metadataKey, values, target);
  }
}

export function mergeObjectMetadata(
  metadataKey: string,
  metadataValue: { [key: string]: any },
  target: any,
  key?: string | symbol,
) {
  const current = (key ? Reflect.getMetadata(metadataKey, target, key) : Reflect.getMetadata(metadataKey, target)) || {};
  const values = { ...current, ...metadataValue };

  if (key) {
    Reflect.defineMetadata(metadataKey, values, target, key);
  } else {
    Reflect.defineMetadata(metadataKey, values, target);
  }
}

export function addToMapMetadata<K, V>(
  metadataKey: string,
  mapKey: K,
  mapValue: V,
  target: any,
  key?: string | symbol,
) {
  const current: Map<K, V> = (key ? Reflect.getMetadata(metadataKey, target, key) : Reflect.getMetadata(metadataKey, target)) || new Map<K, V>();
  const values = new Map<K, V>([ ...current ]);
  values.set(mapKey, mapValue);

  if (key) {
    Reflect.defineMetadata(metadataKey, values, target, key);
  } else {
    Reflect.defineMetadata(metadataKey, values, target);
  }
}

export const SetMetadata = (
  props: { [metadataKey: string]: any },
  writable: boolean = false,
): any => (target: object, key?: any, descriptor?: any) => {
  let actualTarget: object = target;
  let actualReturn: object = target;

  if (key && !descriptor) {
    // This is a really weird behavior and I don't pretend to fully understand it,
    // but apparently TypeScript doesn't define `writable` on properties in all
    // use cases where you're using them.
    Object.defineProperty(target, key, {
      writable: true,
      enumerable: true,
    });
  } else if (descriptor) {
    actualTarget = descriptor.value;
    actualReturn = descriptor;
  }

  const pairs = _.toPairs(props);
  for (const pair of pairs) {
    Reflect.defineMetadata(pair[0], pair[1], actualTarget);
  }
  return actualReturn;
};

export const ExtendArrayMetadata = <V = any>(
  metadataKey: string,
  metadataValue: V | Array<V | Array<V>>,
): any => (target: object, key?: any, descriptor?: any) => {
  let actualTarget: object = target;
  let actualReturn: object = target;

  if (descriptor) {
    actualTarget = descriptor.value;
    actualReturn = descriptor;
  }

  appendArrayMetadata(metadataKey, metadataValue, actualTarget, key);
  return actualReturn;
};

export const ExtendObjectMetadata = <V = any>(
  metadataKey: string,
  metadataValue: { [k: string]: V },
): any => (target: object, key?: any, descriptor?: any) => {
  let actualTarget: object = target;
  let actualReturn: object = target;

  if (descriptor) {
    actualTarget = descriptor.value;
    actualReturn = descriptor;
  }

  mergeObjectMetadata(metadataKey, metadataValue, target, key);
  return actualReturn;
};
