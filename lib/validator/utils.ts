import z from "zod";
import { ZOD_SCHEMA_KEY } from "./constants";

export function getZodSchemaForDto(dtoClass: any) {
  const schemaMap = Reflect.getMetadata(ZOD_SCHEMA_KEY, dtoClass) || {};
  const t = z.object(schemaMap);
  return t;
}
