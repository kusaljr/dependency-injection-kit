import { Application, NextFunction, Request, Response } from "express";
import {
  HttpMethod,
  InterceptorFunction,
  MethodInterceptor,
  ParameterDefinition,
  ParameterType,
  RouteDefinition,
} from "../decorators/express";
import { Constructor, Container } from "../global/container";
import { findControllerFiles } from "./find-controller";

import * as fs from "fs";
import * as path from "path";
import { REACT_METADATA } from "../ops/react/decorator";
import { renderReactView } from "../ops/react/render-react-view";
import { SOCKET_METADATA_KEY } from "../ops/socket/decorator";
import { WebSocketServer } from "../ops/socket/web-socket";
import { generateReactView } from "./static/generate-react-view";

const wrapMiddleware = (fn: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return fn(req, res, next);
  };
};

const colorText = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  orange: (text: string) => `\x1b[33m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
  white: (text: string) => `\x1b[37m${text}\x1b[0m`,
};

const colorMethod = (method: string): string => {
  switch (method.toUpperCase()) {
    case "GET":
      return colorText.green(method.toUpperCase());
    case "POST":
      return colorText.orange(method.toUpperCase());
    case "PATCH":
      return colorText.yellow(method.toUpperCase());
    case "DELETE":
      return colorText.red(method.toUpperCase());
    default:
      return colorText.white(method.toUpperCase());
  }
};

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
  app: Application,
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

        const controllerInterceptors: InterceptorFunction[] =
          Reflect.getMetadata("controllerInterceptors", ControllerClass) || [];

        routes.sort((a, b) => {
          const aHasParam = a.path.includes(":");
          const bHasParam = b.path.includes(":");
          if (aHasParam && !bHasParam) return 1;
          if (!aHasParam && bHasParam) return -1;
          return 0;
        });

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

            const finalRouteHandler = async (
              req: Request,
              res: Response,
              next: NextFunction
            ) => {
              const parameters: ParameterDefinition[] =
                Reflect.getMetadata(
                  "parameters",
                  ControllerClass.prototype,
                  route.handlerName
                ) || [];

              const args: any[] = new Array(
                Math.max(...parameters.map((p) => p.index + 1), 0)
              ).fill(undefined);

              parameters.forEach((param) => {
                switch (param.type) {
                  case ParameterType.REQ:
                    args[param.index] = req;
                    break;
                  case ParameterType.RES:
                    args[param.index] = res;
                    break;
                  case ParameterType.PARAM:
                    args[param.index] = (req.params as Record<string, any>)[
                      param.name!
                    ];
                    break;
                  case ParameterType.QUERY:
                    args[param.index] = (req.query as Record<string, any>)[
                      param.name!
                    ];
                    break;
                  case ParameterType.BODY:
                    args[param.index] = req.body;
                    break;
                  default:
                    break;
                }
              });

              try {
                const result = await originalControllerMethod.apply(
                  instance,
                  args
                );

                if (hasReactMetadata && req.accepts("html")) {
                  const handler = String(route.handlerName);
                  const tsxFile = path.join(
                    path.dirname(filePath),
                    "views", // Assuming 'views' subdirectory
                    `${ControllerClass.name.toLowerCase()}.${handler}.tsx`
                  );
                  const html = await renderReactView(tsxFile, result);
                  res.send(html);
                } else {
                  if (result !== undefined && !res.headersSent) {
                    res.json(result);
                  }
                }
              } catch (error) {
                console.error(
                  `Error in handler ${String(route.handlerName)} for route ${
                    prefix + route.path
                  }:`,
                  error
                );
                if (!res.headersSent) {
                  res.status(500).json({ error: "Internal Server Error" });
                }
              }
            };

            app[route.method as keyof Application](
              prefix + route.path,
              ...[...controllerInterceptors, ...methodInterceptors].map(
                wrapMiddleware
              ),
              finalRouteHandler.bind(instance)
            );

            console.log(
              `Registered route: [${colorMethod(
                route.method
              )}] ${colorText.cyan(prefix + route.path)} -> ${colorText.magenta(
                `${ControllerClass.name}.${String(route.handlerName)}`
              )} ${hasReactMetadata ? colorText.green("(+React View)") : ""}`
            );
          } else {
            console.warn(
              `Unsupported HTTP method '${route.method}' for route: ${prefix}${route.path} in ${ControllerClass.name}`
            );
          }
        });
      }
    }

    if (!controllerFoundInFile) {
      throw new Error(
        `File '${filePath}' ends with '.controller.ts' but no class with @Controller decorator was found.`
      );
    }
  }

  const wsServer = new WebSocketServer(websocketPort);

  const gatewayFiles = findGatewayFiles(controllersDir);

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
