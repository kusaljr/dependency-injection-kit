// zod-decorators.ts
import "reflect-metadata";
import { z } from "zod";
import { ZOD_SCHEMA_KEY } from "./constants";

export function IsString() {
  return function (target: any, propertyKey: string) {
    const schema =
      Reflect.getMetadata(ZOD_SCHEMA_KEY, target.constructor) || {};
    schema[propertyKey] = z.string();
    Reflect.defineMetadata(ZOD_SCHEMA_KEY, schema, target.constructor);
  };
}

export function IsNumber() {
  return function (target: any, propertyKey: string) {
    const schema =
      Reflect.getMetadata(ZOD_SCHEMA_KEY, target.constructor) || {};
    schema[propertyKey] = z.number();
    Reflect.defineMetadata(ZOD_SCHEMA_KEY, schema, target.constructor);
  };
}

export function IsOptional() {
  return function (target: any, propertyKey: string) {
    const schema =
      Reflect.getMetadata(ZOD_SCHEMA_KEY, target.constructor) || {};
    schema[propertyKey] = (schema[propertyKey] || z.any()).optional();
    Reflect.defineMetadata(ZOD_SCHEMA_KEY, schema, target.constructor);
  };
}
