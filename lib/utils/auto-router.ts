import {
  HttpMethod,
  ParameterDefinition,
  ParameterType,
  RouteDefinition,
} from "../decorators/router";
import { Constructor, Container } from "../global/container";
import { findControllerFiles } from "./find-controller";

import {
  BunServe,
  Middleware,
  wrapExpressMiddleware,
} from "@express-di-kit/bun-engine";
import {
  Context,
  DiKitRequest,
  DiKitResponse,
} from "@express-di-kit/bun-engine/types";
import { HttpException } from "@express-di-kit/common/exceptions";
import { CanActivate, evaluateGuards } from "@express-di-kit/common/middleware";
import {
  CallHandler,
  DiKitInterceptor,
  ExecutionContext,
  INTERCEPTOR_METADATA,
} from "@express-di-kit/global/interceptor";
import { WebSocketServer } from "@express-di-kit/socket/web-socket";
import * as fs from "fs";
import * as path from "path";
import { ZodError } from "zod";
import { SOCKET_METADATA_KEY } from "../socket/decorator";
import { REACT_METADATA } from "../static/decorator";
import { getZodSchemaForDto } from "../validator/utils";
import { colorMethod, colorText } from "./colors";
import { generateDynamicHtml } from "./static/generate-dynamic-html";
import { generateReactView } from "./static/generate-react-view";
import { processBodyAndValidate } from "./validate";

function findGatewayFiles(dir: string): string[] {
  let gatewayFiles: string[] = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      gatewayFiles = gatewayFiles.concat(findGatewayFiles(fullPath));
    } else if (
      (file.endsWith(".gateway.ts") || file.endsWith(".gateway.js")) &&
      !file.endsWith(".d.ts")
    ) {
      gatewayFiles.push(fullPath);
    }
  }

  return gatewayFiles;
}

export async function registerControllers(
  app: BunServe,
  controllersDir: string,
  container: Container,
  websocketPort = 3001
) {
  // ---- Register Express Controllers ----
  const files = findControllerFiles(controllersDir);

  for (const filePath of files) {
    if (
      !filePath.endsWith(".controller.ts") &&
      !filePath.endsWith(".controller.js")
    ) {
      console.warn(`Skipping non-controller file: ${filePath}`);
      continue;
    }

    const module = require(filePath);
    let controllerFoundInFile = false;

    for (const key of Object.keys(module)) {
      const ControllerClass: Constructor = module[key];

      const prefix: string | undefined = Reflect.getMetadata(
        "prefix",
        ControllerClass
      );
      const routes: RouteDefinition[] =
        Reflect.getMetadata("routes", ControllerClass) || [];

      if (prefix !== undefined) {
        controllerFoundInFile = true;

        if (routes.length === 0) {
          console.warn(
            `Controller ${ControllerClass.name} has no routes defined. Skipping.`
          );
          continue;
        }

        const instance = container.resolve(ControllerClass) as Record<
          string,
          any
        >;

        routes.sort((a, b) => {
          const aHasParam = a.path.includes(":");
          const bHasParam = b.path.includes(":");
          if (aHasParam && !bHasParam) return 1;
          if (!aHasParam && bHasParam) return -1;
          return 0;
        });

        console.log("");
        console.log(
          `------ ${colorText.green(ControllerClass.name)} Routes -------`
        );

        routes.forEach((route: RouteDefinition) => {
          const originalControllerMethod = instance[String(route.handlerName)];

          if (typeof originalControllerMethod !== "function") {
            throw new Error(
              `Handler '${String(route.handlerName)}' for route ${
                route.path
              } in ${ControllerClass.name} is not a function.`
            );
          }

          const hasReactMetadata = Reflect.getMetadata(
            REACT_METADATA,
            ControllerClass.prototype,
            route.handlerName
          );

          if (hasReactMetadata) {
            generateReactView(
              ControllerClass.name,
              String(route.handlerName),
              filePath,
              prefix + route.path
            );
          }

          if (Object.values(HttpMethod).includes(route.method as HttpMethod)) {
            const methodMiddlewares: Middleware[] =
              Reflect.getMetadata(
                "methodMiddlewares",
                ControllerClass.prototype,
                route.handlerName
              ) || [];

            const classInterceptorsConstructors: Constructor<DiKitInterceptor>[] =
              Reflect.getMetadata(INTERCEPTOR_METADATA, ControllerClass) || [];

            const methodInterceptorsConstructors: Constructor<DiKitInterceptor>[] =
              Reflect.getMetadata(
                INTERCEPTOR_METADATA,
                ControllerClass.prototype,
                route.handlerName
              ) || [];

            const allInterceptorConstructors = [
              ...classInterceptorsConstructors,
              ...methodInterceptorsConstructors,
            ];

            const interceptorInstances: DiKitInterceptor[] =
              allInterceptorConstructors.map((I) => container.resolve(I));

            const finalRouteHandler = async (ctx: Context) => {
              try {
                const parameters: ParameterDefinition[] =
                  Reflect.getMetadata(
                    "parameters",
                    ControllerClass.prototype,
                    route.handlerName
                  ) || [];

                const args: any[] = new Array(
                  Math.max(...parameters.map((p) => p.index + 1), 0)
                ).fill(undefined);

                for (const param of parameters) {
                  switch (param.type) {
                    case ParameterType.REQ:
                      args[param.index] = ctx.req;
                      break;
                    case ParameterType.RES:
                      args[param.index] = ctx.res;
                      break;
                    case ParameterType.PARAM:
                      args[param.index] = ctx.params[param.name!];
                      break;
                    case ParameterType.QUERY:
                      args[param.index] = ctx.query[param.name!];
                      break;
                    case ParameterType.BODY:
                      const ParamType = Reflect.getMetadata(
                        "design:paramtypes",
                        ControllerClass.prototype,
                        route.handlerName
                      )?.[param.index];

                      if (!ParamType) {
                        console.warn(
                          `Missing design:paramtypes metadata for parameter ${
                            param.index
                          } of ${String(route.handlerName)} in ${
                            ControllerClass.name
                          }. Cannot validate body.`
                        );
                        args[param.index] = ctx.req.body;
                        break;
                      }

                      const zodSchema = getZodSchemaForDto(ParamType);
                      if (!zodSchema) {
                        console.warn(
                          `No Zod schema found for DTO type ${ParamType.name}. Assigning raw body.`
                        );
                        args[param.index] = ctx.req.body;
                        break;
                      }

                      const newParsedResult = await processBodyAndValidate(
                        ctx,
                        ParamType
                      );
                      args[param.index] = newParsedResult;
                      break;
                    default:
                      break;
                  }
                }

                const createCallHandler = (index: number): CallHandler => {
                  return {
                    handle: async () => {
                      if (index < interceptorInstances.length) {
                        const currentInterceptor = interceptorInstances[index];
                        const executionContext: ExecutionContext = {
                          getType: () => "http",
                          switchToHttp: () => ({
                            getRequest: () => ctx.req,
                            getResponse: () => ctx.res,
                          }),
                          getHandler: () => originalControllerMethod,
                          getClass: () => ControllerClass,
                        };
                        return currentInterceptor.intercept(
                          executionContext,
                          createCallHandler(index + 1)
                        );
                      } else {
                        return originalControllerMethod.apply(instance, args);
                      }
                    },
                  };
                };

                const resultFromInterceptors = await createCallHandler(
                  0
                ).handle();

                if (hasReactMetadata) {
                  const handler = String(route.handlerName);
                  const jsFileName = `${ControllerClass.name}.${handler}.entry.js`;
                  const props = ctx.body || resultFromInterceptors;
                  const seoMeta = resultFromInterceptors?.head;
                  const html = generateDynamicHtml(jsFileName, props, seoMeta);

                  if (!ctx.res.headersSent()) {
                    ctx.res.setHeader(
                      "Content-Type",
                      "text/html; charset=utf-8"
                    );
                    ctx.res.send(html);
                  }
                } else {
                  if (
                    resultFromInterceptors !== undefined &&
                    !ctx.res.headersSent()
                  ) {
                    ctx.res.json(resultFromInterceptors);
                  }
                }
              } catch (error) {
                console.error(
                  `Error in handler ${String(route.handlerName)} for route ${
                    prefix + route.path
                  }:`,
                  error
                );

                if (ctx.res.headersSent()) {
                  return;
                }

                if (error instanceof ZodError) {
                  ctx.res.status(422).json({
                    message: "Validation failed",
                    errors: error.issues,
                  });
                } else if (error instanceof HttpException) {
                  ctx.res.status(error.status).json(error.toJson());
                } else {
                  ctx.res.status(500).json({ error: "Internal Server Error" });
                }
              }
            };

            const classGuards: (new () => CanActivate)[] =
              Reflect.getMetadata("classGuards", ControllerClass) || [];
            const methodGuards: (new () => CanActivate)[] =
              Reflect.getMetadata(
                "methodGuards",
                ControllerClass.prototype,
                route.handlerName
              ) || [];

            const expressStyleGuardMiddleware = async (
              req: DiKitRequest,
              res: DiKitResponse,
              next: () => void
            ) => {
              try {
                const guardClasses = [...classGuards, ...methodGuards];
                const guardInstances: CanActivate[] = guardClasses.map(
                  (GuardClass) => container.resolve(GuardClass)
                );

                const passed = await evaluateGuards(guardInstances, req, res);

                if (!passed) {
                  if (!res.headersSent()) {
                    res.status(403).json({ message: "Forbidden by guard." });
                  }
                  return;
                }

                next();
              } catch (err: any) {
                console.error(
                  `Guard error in ${ControllerClass.name}.${String(
                    route.handlerName
                  )}:`,
                  err.message || err
                );

                if (!res.headersSent()) {
                  if (err instanceof HttpException) {
                    res.status(err.status).json(err.toJson());
                  } else {
                    res.status(500).json({ message: "Guard internal error." });
                  }
                }
              }
            };

            const bunServeGuardMiddleware: Middleware = wrapExpressMiddleware(
              expressStyleGuardMiddleware
            );

            app[route.method.toLowerCase() as keyof BunServe](
              (prefix + route.path) as any,
              ...methodMiddlewares,
              bunServeGuardMiddleware,
              finalRouteHandler
            );

            console.log(
              ` ${colorText.cyan(prefix + route.path)}  [${colorMethod(
                route.method
              )}] -> ${colorText.magenta(
                `${ControllerClass.name}.${String(route.handlerName)}`
              )} ${
                hasReactMetadata
                  ? colorText.cyan("(Server rendered React View)")
                  : ""
              }`
            );
          } else {
            console.warn(
              `Unsupported HTTP method '${route.method}' for route: ${prefix}${route.path} in ${ControllerClass.name}`
            );
          }
        });

        console.log("");
      }
    }

    if (!controllerFoundInFile) {
      throw new Error(
        `File '${filePath}' ends with '.controller.ts' but no class with @Controller decorator was found.`
      );
    }
  }

  // ---- WebSocket Gateway Registration ----
  const gatewayFiles = findGatewayFiles(controllersDir);

  if (gatewayFiles.length === 0) {
    return;
  } else {
    const wsServer = new WebSocketServer(websocketPort);

    for (const filePath of gatewayFiles) {
      if (
        !filePath.endsWith(".gateway.ts") &&
        !filePath.endsWith(".gateway.js")
      ) {
        console.warn(`Skipping non-gateway file: ${filePath}`);
        continue;
      }

      const module = require(filePath);

      for (const key of Object.keys(module)) {
        const GatewayClass = module[key];

        const isSocket = Reflect.getMetadata(SOCKET_METADATA_KEY, GatewayClass);
        if (!isSocket) continue;

        const instance = container.resolve(GatewayClass);
        wsServer.registerHandler(instance);

        console.log(`Registered WebSocket Gateway: ${GatewayClass.name}`);
      }
    }

    wsServer.start();
  }
}
