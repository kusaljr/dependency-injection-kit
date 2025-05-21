import express, { Express } from "express";

import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { registerControllers } from "../utils/auto-router";
import { generateEnvConfig } from "../utils/env-generator";
import {
  collectControllersForSwagger,
  generateSwaggerDoc,
} from "../utils/swagger-generator";
import { Container } from "./container";

import "./injection";

interface AppConfig {
  port: number;
  envSchema: z.ZodObject<any>;
  swaggerOptions?: {
    title: string;
    version: string;
    description: string;
  };
}

export async function createApp(config: AppConfig): Promise<Express> {
  const app = express();
  const container = Container.getInstance();

  app.use(express.json());

  generateEnvConfig(config.envSchema);

  const controllersDirectory = process.cwd() + "/src";
  await registerControllers(app, controllersDirectory, container);

  if (config.swaggerOptions) {
    const { title, version, description } = config.swaggerOptions;
    const controllerClasses = await collectControllersForSwagger(
      controllersDirectory
    );
    const swaggerDocument = generateSwaggerDoc(controllerClasses, {
      title,
      version,
      description,
    });

    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    console.log("Swagger UI available at http://localhost:3000/api-docs");
  }

  return app;
}
