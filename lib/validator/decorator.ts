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
    updateSchema(target, propertyKey, () => z.coerce.number());
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

export function IsFile(options?: IsFileOptions) {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, (existing) => {
      let fileSchema: ZodTypeAny = z.instanceof(File, {
        message: "Expected a file upload",
      });

      if (options?.mimeTypes) {
        fileSchema = fileSchema.refine(
          (file: File) => options.mimeTypes!.includes(file.type),
          {
            message: `Invalid file type. Allowed types: ${options.mimeTypes.join(
              ", "
            )}`,
          }
        );
      }

      if (options?.maxSize) {
        fileSchema = fileSchema.refine(
          (file: File) => file.size <= options.maxSize!,
          {
            message: `File size exceeds the limit of ${
              options.maxSize / (1024 * 1024)
            }MB`,
          }
        );
      }

      // Combine with existing schema (e.g., if IsOptional was also applied)
      return fileSchema.and(existing);
    });
  };
}

// Helper to retrieve the final schema
export function getSchema<T extends new (...args: any[]) => any>(
  targetClass: T
) {
  const schemaMap = Reflect.getMetadata(ZOD_SCHEMA_KEY, targetClass) || {};
  return z.object(schemaMap);
}
