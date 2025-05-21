// src/common/auto-router.ts
import { Application, Request, Response } from "express";
import { HttpMethod, RouteDefinition } from "../decorators/express";
import { Constructor, Container } from "../global/container";
import { findControllerFiles } from "./find-controller";

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

        routes.forEach((route: RouteDefinition) => {
          if (typeof instance[String(route.handlerName)] !== "function") {
            throw new Error(
              `Handler '${String(route.handlerName)}' for route ${
                route.path
              } in ${ControllerClass.name} is not a function.`
            );
          }

          if (Object.values(HttpMethod).includes(route.method as HttpMethod)) {
            app[route.method as keyof Application](
              prefix + route.path,
              async (req: Request, res: Response) => {
                const handler = instance[String(route.handlerName)];
                const paramMetadata: any[] =
                  Reflect.getMetadata(
                    "parameters",
                    Object.getPrototypeOf(instance),
                    route.handlerName
                  ) || [];

                const args: any[] = [];

                for (const { index, type, name } of paramMetadata) {
                  switch (type) {
                    case "param":
                      args[index] = req.params[name];
                      break;
                    case "query":
                      args[index] = req.query[name];
                      break;
                    case "req":
                      args[index] = req;
                      break;
                    case "res":
                      args[index] = res;
                      break;
                    default:
                      args[index] = undefined;
                  }
                }

                try {
                  const result = await handler.apply(instance, args);
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
              }
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
