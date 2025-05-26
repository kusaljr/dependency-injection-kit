import "reflect-metadata";

export const REACT_METADATA = Symbol("react:metadata");

export function React() {
  return function (target: any, propertyKey?: string | symbol) {
    if (propertyKey) {
      Reflect.defineMetadata(REACT_METADATA, true, target, propertyKey);
    } else {
      Reflect.defineMetadata(REACT_METADATA, true, target);
    }
  };
}
