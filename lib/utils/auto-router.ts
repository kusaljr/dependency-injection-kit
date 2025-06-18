// src/app-builder/register-controller.ts

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
  Context,
  Middleware,
  wrapExpressMiddleware,
} from "@express-di-kit/bun-engine"; // Ensure wrapExpressMiddleware is imported
import { HttpException } from "@express-di-kit/common/exceptions";
import { CanActivate, evaluateGuards } from "@express-di-kit/common/middleware"; // Corrected to use common/middleware
import {
  CallHandler,
  DiKitInterceptor,
  ExecutionContext,
  INTERCEPTOR_METADATA,
} from "@express-di-kit/global/interceptor";
import { WebSocketServer } from "@express-di-kit/socket/web-socket";
import * as fs from "fs";
import * as path from "path";
import { SOCKET_METADATA_KEY } from "../socket/decorator";
import { REACT_METADATA } from "../static/decorator";
import { getZodSchemaForDto } from "../validator/utils"; // Corrected path
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

        // Sort routes to prioritize static paths over dynamic paths (with params)
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
            // Retrieve regular route-specific middlewares (BunServe's Middleware type)
            const methodMiddlewares: Middleware[] = // Changed MethodInterceptor to Middleware
              Reflect.getMetadata(
                "methodMiddlewares", // Assuming this metadata key is for regular BunServe middlewares
                ControllerClass.prototype,
                route.handlerName
              ) || [];

            // --- INTERCEPTOR LOGIC START ---
            // Get class-level interceptors
            const classInterceptorsConstructors: Constructor<DiKitInterceptor>[] =
              Reflect.getMetadata(INTERCEPTOR_METADATA, ControllerClass) || [];

            // Get method-level interceptors
            const methodInterceptorsConstructors: Constructor<DiKitInterceptor>[] =
              Reflect.getMetadata(
                INTERCEPTOR_METADATA,
                ControllerClass.prototype,
                route.handlerName
              ) || [];

            // Combine and resolve all interceptor instances
            const allInterceptorConstructors = [
              ...classInterceptorsConstructors,
              ...methodInterceptorsConstructors,
            ];

            const interceptorInstances: DiKitInterceptor[] =
              allInterceptorConstructors.map((I) => container.resolve(I));
            // --- INTERCEPTOR LOGIC END ---

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
                    )?.[param.index]; // Use optional chaining for safety

                    if (!ParamType) {
                      console.warn(
                        `Missing design:paramtypes metadata for parameter ${
                          param.index
                        } of ${String(route.handlerName)} in ${
                          ControllerClass.name
                        }. Cannot validate body.`
                      );
                      args[param.index] = ctx.req.body; // Assign raw body if type is unknown
                      break;
                    }

                    const zodSchema = getZodSchemaForDto(ParamType);

                    if (!zodSchema) {
                      console.warn(
                        `No Zod schema found for DTO type ${ParamType.name}. Assigning raw body.`
                      );
                      args[param.index] = ctx.req.body; // Assign raw body if no schema
                      break;
                    }

                    const parseResult = zodSchema.safeParse(ctx.req.body);

                    if (!parseResult.success) {
                      ctx.status(422).json({
                        message: "Validation failed",
                        errors: parseResult.error.flatten().fieldErrors,
                      });
                      return; // Stop execution if validation fails
                    }

                    args[param.index] = parseResult.data;
                    break;
                  default:
                    break;
                }
              }

              // --- INTERCEPTOR CHAIN EXECUTION ---
              const createCallHandler = (index: number): CallHandler => {
                return {
                  handle: async () => {
                    if (index < interceptorInstances.length) {
                      const currentInterceptor = interceptorInstances[index];
                      const executionContext: ExecutionContext = {
                        getType: () => "http", // Assuming HTTP context for now
                        switchToHttp: () => ({
                          getRequest: () => ctx.req,
                          getResponse: () => ctx, // Pass BunServe's Context as the 'res'
                        }),
                        getHandler: () => originalControllerMethod,
                        getClass: () => ControllerClass,
                      };
                      // Call the current interceptor's intercept method, passing the next handler
                      return currentInterceptor.intercept(
                        executionContext,
                        createCallHandler(index + 1) // Recursively create the next CallHandler
                      );
                    } else {
                      // If no more interceptors, execute the actual controller method
                      return originalControllerMethod.apply(instance, args);
                    }
                  },
                };
              };

              let resultFromInterceptors: any;
              try {
                // Start the interceptor chain with the first interceptor (or the handler if no interceptors)
                resultFromInterceptors = await createCallHandler(0).handle();

                // If the interceptor chain completes successfully, handle the response
                if (hasReactMetadata) {
                  const handler = String(route.handlerName);
                  const jsFileName = `${ControllerClass.name}.${handler}.entry.js`;

                  // Use the result from the interceptor chain as props
                  const props = ctx.body || resultFromInterceptors;

                  // Assume seoMeta comes from the result of the handler/interceptor chain
                  const seoMeta = resultFromInterceptors?.head;

                  const html = generateDynamicHtml(jsFileName, props, seoMeta);

                  if (!ctx.headersSent()) {
                    ctx.setHeader("Content-Type", "text/html; charset=utf-8");
                    ctx.send(html);
                  }
                } else {
                  // If it's a JSON API, and no response has been sent yet, send the JSON result
                  if (
                    resultFromInterceptors !== undefined &&
                    !ctx.headersSent()
                  ) {
                    ctx.json(resultFromInterceptors);
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
                  if (!ctx.headersSent()) {
                    ctx.status(error.status).json(error.toJson());
                  }
                } else {
                  if (!ctx.headersSent()) {
                    ctx.status(500).json({ error: "Internal Server Error" });
                  }
                }
              }
            };

            // Retrieve guard constructors
            const classGuards: (new () => CanActivate)[] =
              Reflect.getMetadata("classGuards", ControllerClass) || [];
            const methodGuards: (new () => CanActivate)[] =
              Reflect.getMetadata(
                "methodGuards",
                ControllerClass.prototype,
                route.handlerName
              ) || [];

            // Define the Express-style guard middleware function
            const expressStyleGuardMiddleware = async (
              req: any, // This is the ExpressReq shim
              res: any, // This is the ExpressRes shim, which points to ctx
              next: any // This is the Express-style next callback
            ) => {
              try {
                const guardClasses = [...classGuards, ...methodGuards];
                const guardInstances: CanActivate[] = guardClasses.map(
                  (GuardClass) => container.resolve(GuardClass)
                );

                // evaluateGuards will receive the expressReq and expressRes shims
                const passed = await evaluateGuards(guardInstances, req, res);

                if (!passed) {
                  // If guard fails, a response might already be set by canActivate.
                  // If not, ensure one is sent here using the expressRes shim.
                  if (!res.headersSent) {
                    // Use headersSent from the expressRes shim
                    res.status(403).json({ message: "Forbidden by guard." });
                  }
                  return; // Stop the middleware chain
                }

                // If guards pass, proceed to the next middleware/handler in the BunServe chain
                next();
              } catch (err: any) {
                console.error(
                  `Guard error in ${ControllerClass.name}.${String(
                    route.handlerName
                  )}:`,
                  err.message || err
                );

                if (!res.headersSent) {
                  if (err instanceof HttpException) {
                    res.status(err.status).json(err.toJson());
                  } else {
                    res.status(500).json({ message: "Guard internal error." });
                  }
                }
                // No `next()` call here, as an error occurred and a response was sent.
              }
            };

            // --- IMPORTANT: Wrap the Express-style guard middleware for BunServe ---
            const bunServeGuardMiddleware: Middleware = wrapExpressMiddleware(
              expressStyleGuardMiddleware
            );

            // Register the route with BunServe
            // The order is important: global -> method-specific BunServe middlewares -> wrapped guards -> final handler
            app[route.method.toLowerCase() as keyof BunServe](
              (prefix + route.path) as any,
              ...methodMiddlewares, // Regular BunServe specific middlewares
              bunServeGuardMiddleware, // The wrapped guard middleware
              finalRouteHandler // Your final handler which now runs the interceptor chain
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
              } ${
                interceptorInstances.length > 0
                  ? colorText.yellow(
                      `(${interceptorInstances.length} Interceptors)`
                    )
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
