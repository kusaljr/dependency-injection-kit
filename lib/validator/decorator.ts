import "reflect-metadata";
import { z, ZodTypeAny } from "zod";
import { ZOD_SCHEMA_KEY } from "./constants";

// Add missing interface
export interface IsFileOptions {
  mimeTypes?: string[];
  maxSize?: number;
}

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
      // Combines with existing schema, ensuring email format
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
      // Combines with existing schema, ensuring minimum length
      return z.string().min(length).and(existing);
    });
  };
}

export function MaxLength(length: number) {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, (existing) => {
      // Combines with existing schema, ensuring maximum length
      return z.string().max(length).and(existing);
    });
  };
}

export function IsBoolean() {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, () => z.boolean());
  };
}

export function IsArray(
  type: Function, // e.g. String, Number, Boolean, or class
  options?: { min?: number; max?: number }
) {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, () => {
      let itemSchema: ZodTypeAny;

      switch (type) {
        case String:
          itemSchema = z.string();
          break;
        case Number:
          itemSchema = z.number();
          break;
        case Boolean:
          itemSchema = z.boolean();
          break;
        default:
          // Assume it's a class with decorators
          itemSchema = z.object(
            generateZodSchemaFromClass(type as new () => any)
          );
      }

      let arraySchema = z.array(itemSchema);

      if (options?.min !== undefined) {
        arraySchema = arraySchema.min(options.min);
      }
      if (options?.max !== undefined) {
        arraySchema = arraySchema.max(options.max);
      }

      return arraySchema;
    });
  };
}

function generateZodSchemaFromClass(
  cls: new () => any
): Record<string, ZodTypeAny> {
  const schemaMap = Reflect.getMetadata(ZOD_SCHEMA_KEY, cls) || {};
  return schemaMap;
}

export function IsObject(
  classOrSchema: ZodTypeAny | (new () => any),
  options?: { isArray?: boolean }
) {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, () => {
      let baseSchema: ZodTypeAny;

      if (typeof classOrSchema === "function") {
        const nestedSchema = generateZodSchemaFromClass(classOrSchema);
        baseSchema = z.object(nestedSchema);
      } else {
        baseSchema = classOrSchema;
      }

      if (options?.isArray) {
        return z.array(baseSchema);
      }

      return baseSchema;
    });
  };
}

export function IsFile(options?: IsFileOptions) {
  return function (target: any, propertyKey: string) {
    updateSchema(target, propertyKey, (existing) => {
      // Keep 'existing' here to combine
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

function makeZodSchemaPartial(
  schema: ZodTypeAny,
  deep: boolean = false
): ZodTypeAny {
  if (schema instanceof z.ZodOptional) {
    return schema;
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const partialShape: Record<string, ZodTypeAny> = {};

    for (const key in shape) {
      if (deep) {
        partialShape[key] = makeZodSchemaPartial(shape[key], true);
      } else {
        partialShape[key] = shape[key].optional();
      }
    }

    return z.object(partialShape).optional();
  }

  if (schema instanceof z.ZodArray) {
    if (deep) {
      const elementSchema = makeZodSchemaPartial(schema.element, true);
      return z.array(elementSchema).optional();
    } else {
      return schema.optional();
    }
  }

  if (schema instanceof z.ZodIntersection) {
    const left = makeZodSchemaPartial(schema._def.left, deep);
    const right = makeZodSchemaPartial(schema._def.right, deep);
    return z.intersection(left, right);
  }

  if (schema instanceof z.ZodUnion) {
    return schema.optional();
  }

  return schema.optional();
}

export function PartialType<T extends new (...args: any[]) => any>(
  BaseClass: T,
  options?: { deep?: boolean }
): new (...args: any[]) => any {
  class PartialDto extends (BaseClass as new (...args: any[]) => any) {}

  const baseSchema = getSchema(BaseClass);

  let partialSchema: z.ZodObject<any>;

  if (options?.deep) {
    partialSchema = makeZodSchemaPartial(baseSchema, true) as z.ZodObject<any>;
    Reflect.defineMetadata(ZOD_SCHEMA_KEY, partialSchema, PartialDto);
  } else {
    partialSchema = baseSchema.partial();
    Reflect.defineMetadata(ZOD_SCHEMA_KEY, partialSchema.shape, PartialDto);
  }

  return PartialDto;
}

export function getSchema<T extends new (...args: any[]) => any>(
  targetClass: T
) {
  const directSchema = Reflect.getMetadata(ZOD_SCHEMA_KEY, targetClass);

  if (directSchema && typeof directSchema.parse === "function") {
    return directSchema;
  }

  if (
    directSchema &&
    typeof directSchema === "object" &&
    Object.keys(directSchema).length > 0
  ) {
    return z.object(directSchema);
  }

  const mergedSchemaMap: Record<string, ZodTypeAny> = {};
  let currentClass: any = targetClass;

  while (currentClass && currentClass !== Object) {
    const schemaMap = Reflect.getMetadata(ZOD_SCHEMA_KEY, currentClass) || {};

    const actualSchemaMap =
      typeof schemaMap.parse === "function" ? schemaMap.shape : schemaMap;
    for (const key of Object.keys(actualSchemaMap)) {
      if (!mergedSchemaMap[key] || currentClass === targetClass) {
        mergedSchemaMap[key] = actualSchemaMap[key];
      }
    }
    currentClass = Object.getPrototypeOf(currentClass);
  }

  return z.object(mergedSchemaMap);
}
