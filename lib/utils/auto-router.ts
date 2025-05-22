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

const wrapMiddleware = (fn: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(">> Calling middleware:", fn.name || "anonymous");
    return fn(req, res, next);
  };
};

export async function registerControllers(
  app: Application,
  controllersDir: string,
  container: Container
) {
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

          if (Object.values(HttpMethod).includes(route.method as HttpMethod)) {
            const methodInterceptors: MethodInterceptor[] =
              Reflect.getMetadata(
                "methodMiddlewares",
                ControllerClass.prototype,
                route.handlerName
              ) || [];

            console.log(
              `Registering [${route.method.toUpperCase()}] ${prefix}${
                route.path
              }`
            );

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
                    args[param.index] = req.params[param.name!];
                    break;
                  case ParameterType.QUERY:
                    args[param.index] = req.query[param.name!];
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
                if (result !== undefined && !res.headersSent) {
                  res.json(result);
                }
              } catch (error) {
                console.error(
                  `Error in handler ${String(route.handlerName)}:`,
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
              `Registered route: [${route.method.toUpperCase()}] ${prefix}${
                route.path
              } -> ${ControllerClass.name}.${String(route.handlerName)}`
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
}
