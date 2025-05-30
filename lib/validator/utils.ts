import { z } from "zod";
import { ZOD_SCHEMA_KEY } from "./constants";

export function getZodSchemaForDto(dtoClass: any) {
  const schemaMap = Reflect.getMetadata(ZOD_SCHEMA_KEY, dtoClass) || {};
  return z.object(schemaMap);
}
