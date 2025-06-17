import {
  HttpMethod,
  MethodInterceptor,
  ParameterDefinition,
  ParameterType,
  RouteDefinition,
} from "../decorators/router";
import { Constructor, Container } from "../global/container";
import { findControllerFiles } from "./find-controller";

import { BunServe, Context } from "@express-di-kit/bun-engine";
import { HttpException } from "@express-di-kit/common/exceptions";
import { CanActivate, evaluateGuards } from "@express-di-kit/common/middleware";
import { WebSocketServer } from "@express-di-kit/socket/web-socket";
import { getZodSchemaForDto } from "@express-di-kit/validator/utils";
import * as fs from "fs";
import * as path from "path";
import { SOCKET_METADATA_KEY } from "../socket/decorator";
import { REACT_METADATA } from "../static/decorator";
import { colorMethod, colorText } from "./colors";
import { generateDynamicHtml } from "./static/generate-dynamic-html";
import { generateReactView } from "./static/generate-react-view";

// Helper to recursively find gateway files (*.gateway.ts or *.gateway.js)
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

        // const controllerInterceptors: InterceptorFunction[] =
        //   Reflect.getMetadata("controllerInterceptors", ControllerClass) || [];

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

          // Generate React view file if metadata exists
          if (hasReactMetadata) {
            generateReactView(
              ControllerClass.name,
              String(route.handlerName),
              filePath,
              prefix + route.path // Pass the original API route for display
            );
          }

          // Define the single route handler for both JSON API and React View
          if (Object.values(HttpMethod).includes(route.method as HttpMethod)) {
            const methodInterceptors: MethodInterceptor[] =
              Reflect.getMetadata(
                "methodMiddlewares",
                ControllerClass.prototype,
                route.handlerName
              ) || [];

            const finalRouteHandler = async (ctx: Context) => {
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
                    args[param.index] = ctx;
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
                    )[param.index];

                    const zodSchema = getZodSchemaForDto(ParamType);

                    const parseResult = zodSchema.safeParse(ctx.req.body);

                    if (!parseResult.success) {
                      ctx.status(422).json({
                        message: "Validation failed",
                        errors: parseResult.error.flatten().fieldErrors,
                      });
                      return;
                    }

                    args[param.index] = parseResult.data;
                    break;
                  default:
                    break;
                }
              }

              try {
                const result = await originalControllerMethod.apply(
                  instance,
                  args
                );
                if (hasReactMetadata) {
                  const handler = String(route.handlerName);
                  const jsFileName = `${ControllerClass.name}.${handler}.entry.js`;

                  const props = ctx.body || result;

                  const seoMeta = result.head;

                  const html = generateDynamicHtml(jsFileName, props, seoMeta);

                  ctx.setHeader("Content-Type", "text/html; charset=utf-8");
                  ctx.send(html);
                } else {
                  if (result !== undefined) {
                    ctx.json(result);
                  }
                }
              } catch (error) {
                console.error(
                  `Error in handler ${String(route.handlerName)} for route ${
                    prefix + route.path
                  }:`,
                  error
                );
                if (error instanceof HttpException) {
                  ctx.status(error.status).json(error.toJson());
                } else {
                  if (!ctx.headersSent) {
                    ctx.status(500).json({ error: "Internal Server Error" });
                  }
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

            const guardMiddleware = async (req: any, res: any, next: any) => {
              try {
                const guardClasses = [...classGuards, ...methodGuards];
                const guardInstances: CanActivate[] = guardClasses.map(
                  (GuardClass) => container.resolve(GuardClass)
                );

                const passed = await evaluateGuards(guardInstances, req, res);
                if (!passed) {
                  return res
                    .status(403)
                    .json({ message: "Forbidden by guard." });
                }

                next();
              } catch (err: any) {
                console.error(
                  `Guard error in ${ControllerClass.name}.${String(
                    route.handlerName
                  )}:`,
                  err.message || err
                );
                if (res?.status && res?.json) {
                  return res.status(403).json({ ...err });
                }
                next();
              }
            };

            app[route.method as keyof BunServe](
              (prefix + route.path) as any,
              guardMiddleware,

              finalRouteHandler.bind(instance)
            );

            console.log(
              `Registered route: [${colorMethod(
                route.method
              )}] ${colorText.cyan(prefix + route.path)} -> ${colorText.magenta(
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

  //

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
