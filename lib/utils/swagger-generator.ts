import {
  ParameterDefinition,
  ParameterType,
  RouteDefinition,
} from "../decorators/express";
import { Constructor } from "../global/container";
import { findControllerFiles } from "./find-controller";

interface SwaggerOptions {
  title: string;
  version: string;
  description?: string;
  // You can add more OpenAPI root properties here like servers, security, etc.
}

function generateSchemaFromClass(cls: Function): any {
  const props: { [key: string]: Function } =
    Reflect.getMetadata("dto:properties", cls) || {};
  const schemaProps: Record<string, any> = {};

  for (const [key, typeFn] of Object.entries(props)) {
    const type = typeFn.name.toLowerCase();

    schemaProps[key] = {
      type:
        type === "string" || type === "number" || type === "boolean"
          ? type
          : "object",
    };
  }

  return {
    type: "object",
    properties: schemaProps,
    required: Object.keys(schemaProps), // optional: or infer nullable
  };
}

export function generateSwaggerDoc(
  controllers: Function[],
  options: SwaggerOptions
): any {
  const paths: { [path: string]: any } = {};

  for (const controller of controllers) {
    const prefix: string = Reflect.getMetadata("prefix", controller) || "/";
    const routes: RouteDefinition[] =
      Reflect.getMetadata("routes", controller) || [];

    for (const route of routes) {
      const openApiPath = `${prefix === "/" ? "" : prefix}${route.path}`
        .replace(/\/\/+/g, "/")
        .replace(/:([a-zA-Z0-9_]+)/g, "{$1}");

      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }

      const method = route.method.toLowerCase();
      paths[openApiPath][method] = {
        security:
          Reflect.getMetadata(
            "security",
            controller.prototype,
            route.handlerName
          ) || [],
        summary:
          route.summary || `Handles ${method.toUpperCase()} ${openApiPath}`,
        description: route.description,
        tags: route.tags || [controller.name.replace(/Controller$/, "")],
        requestBody:
          route.requestBody ||
          (() => {
            const params: ParameterDefinition[] =
              Reflect.getMetadata(
                "parameters",
                controller.prototype,
                route.handlerName
              ) || [];

            const bodyParam = params.find((p) => p.type === ParameterType.BODY);

            if (bodyParam && (bodyParam as any).schemaType) {
              const schema = generateSchemaFromClass(
                (bodyParam as any).schemaType
              );
              return {
                required: true,
                content: {
                  "application/json": {
                    schema,
                  },
                },
              };
            }
            return undefined;
          })(),

        parameters:
          route.parameters ||
          Reflect.getMetadata(
            "parameters",
            controller.prototype,
            route.handlerName
          )
            ?.map((p: any) => {
              if (p.type === "param") {
                return {
                  name: p.name,
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                };
              }
              if (p.type === "query") {
                return {
                  name: p.name,
                  in: "query",
                  required: false,
                  schema: { type: "string" },
                };
              }
              return undefined;
            })
            ?.filter(Boolean),
        responses: route.responses || {
          "200": { description: "Success" },
        },
        operationId: `${String(
          route.handlerName
        )}_${method.toUpperCase()}_${controller.name.replace(
          /Controller$/,
          ""
        )}`,
      };
    }
  }

  return {
    openapi: "3.0.0",
    info: {
      title: options.title,
      version: options.version,
      description: options.description,
    },
    // Optional: enable this to apply bearer token globally to all endpoints
    // security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT", // optional but helpful
        },
      },
      schemas: {},
    },
  };
}

// Function to collect all decorated controllers for Swagger generation
export async function collectControllersForSwagger(
  controllersDir: string
): Promise<Function[]> {
  const controllerClasses: Function[] = [];
  const files = findControllerFiles(controllersDir);

  for (const filePath of files) {
    if (
      !filePath.endsWith(".controller.ts") &&
      !filePath.endsWith(".controller.js")
    ) {
      continue;
    }

    const module = require(filePath);
    for (const key of Object.keys(module)) {
      const ControllerClass: Constructor = module[key];
      const prefix: string | undefined = Reflect.getMetadata(
        "prefix",
        ControllerClass
      );
      if (prefix !== undefined) {
        controllerClasses.push(ControllerClass);
      }
    }
  }
  return controllerClasses;
}
