// constants.ts

// decorators.ts (your file)
import "reflect-metadata";
import { z, ZodTypeAny } from "zod";
import { ZOD_SCHEMA_KEY } from "./constants";

function updateSchema(
  target: any,
  propertyKey: string,
  updater: (existing: ZodTypeAny) => ZodTypeAny
) {
  const schemaMap =
    Reflect.getMetadata(ZOD_SCHEMA_KEY, target.constructor) || {};

  const existing = schemaMap[propertyKey] || z.any();

  const updated = updater(existing);

  schemaMap[propertyKey] = updated;

  Reflect.defineMetadata(ZOD_SCHEMA_KEY, schemaMap, target.constructor);
}

export function IsNumber() {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, () => z.number());
  };
}

export function IsString() {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, () => z.string());
  };
}

export function IsEmail() {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, (existing) => {
      return z.string().email().and(existing);
    });
  };
}

export function IsOptional() {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, (existing) => existing.optional());
  };
}

export function MinLength(length: number) {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, (existing) => {
      return z.string().min(length).and(existing);
    });
  };
}

export function MaxLength(length: number) {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, (existing) => {
      return z.string().max(length).and(existing);
    });
  };
}

export function IsBoolean() {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, (existing) => z.boolean().and(existing));
  };
}

export function IsArray(
  schema: ZodTypeAny,
  options?: { min?: number; max?: number }
) {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, (existing) => {
      let arraySchema = z.array(schema);
      if (options?.min !== undefined) {
        arraySchema = arraySchema.min(options.min);
      }
      if (options?.max !== undefined) {
        arraySchema = arraySchema.max(options.max);
      }
      return arraySchema.and(existing);
    });
  };
}

export function IsObject(schema: ZodTypeAny) {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, () => schema);
  };
}

// Helper to retrieve the final schema
export function getSchema<T extends new (...args: any[]) => any>(
  targetClass: T
) {
  const schemaMap = Reflect.getMetadata(ZOD_SCHEMA_KEY, targetClass) || {};
  return z.object(schemaMap);
}
