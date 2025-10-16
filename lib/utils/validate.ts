import { BadRequestException } from "@express-di-kit/common";
import { getSchema } from "@express-di-kit/validator/decorator";
import { ZodError } from "zod";

/**
 * Validates incoming body/data against a Zod schema derived from the target class.
 * Works for both HTTP REST (ctx.req.body) and WebSocket (ctx.data).
 */
export async function processBodyAndValidate(
  //   ctx: Context | { data?: any; ws?: any; req?: any; res?: any },
  ctx: any,
  targetClass: any
): Promise<any> {
  // 1️⃣ Determine source of data
  const incomingBody =
    ctx?.req?.body !== undefined
      ? ctx.req.body
      : ctx?.data !== undefined
      ? ctx.data
      : undefined;

  if (incomingBody === undefined) {
    throw new BadRequestException("No body or data found for validation.");
  }

  // 2️⃣ Handle normal object payloads (most common case)
  if (typeof incomingBody === "object" && incomingBody !== null) {
    const zodSchema = getSchema(targetClass);

    if (!zodSchema) {
      throw new BadRequestException(
        `No validation schema found for ${targetClass.name}`
      );
    }

    const parseResult = zodSchema.safeParse(incomingBody);

    if (!parseResult.success) {
      // Unify error handling for both WS + HTTP
      throw new ZodError(parseResult.error.issues);
    }

    return parseResult.data;
  }

  // 3️⃣ Handle FormData (REST file uploads)
  if (incomingBody instanceof FormData) {
    const rawBodyForZod: Record<string, any> = {};

    for (const [key, value] of incomingBody.entries()) {
      if (key in rawBodyForZod) {
        if (Array.isArray(rawBodyForZod[key])) {
          rawBodyForZod[key].push(value);
        } else {
          rawBodyForZod[key] = [rawBodyForZod[key], value];
        }
      } else {
        rawBodyForZod[key] = value;
      }
    }

    const zodSchema = getSchema(targetClass);
    const parseResult = zodSchema.safeParse(rawBodyForZod);

    if (!parseResult.success) {
      console.error("Zod validation failed:", parseResult.error.issues);
      throw new ZodError(parseResult.error.issues);
    }

    return parseResult.data;
  }

  // 4️⃣ Unsupported format
  throw new BadRequestException("Unsupported data format for validation.");
}
