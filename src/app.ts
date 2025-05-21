import express from "express";
import * as path from "path";
import "reflect-metadata";

import "../lib/global/injection";

import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { Container } from "../lib/global/container";
import { registerControllers } from "../lib/utils/auto-router";
import { generateEnvConfig } from "../lib/utils/env-generator";
import {
  collectControllersForSwagger,
  generateSwaggerDoc,
} from "../lib/utils/swagger-generator";

const app = express();
const port = 3000;
const container = Container.getInstance();

const envSchema = z.object({
  PORT: z.coerce.number(),
  STRIPE_API_KEY: z.string(),
  FIREBASE_API_KEY: z.string(),
});

app.use(express.json());

async function bootstrap() {
  try {
    const controllersDirectory = path.join(__dirname);

    const controllerClasses = await collectControllersForSwagger(
      controllersDirectory
    );

    generateEnvConfig(envSchema);
    await registerControllers(app, controllersDirectory, container);
    console.log("Controllers registered successfully!");

    const swaggerDocument = generateSwaggerDoc(controllerClasses, {
      title: "My Awesome API",
      version: "1.0.0",
      description:
        "Automatically generated API documentation for my Express app.",
    });

    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    console.log("Swagger UI available at http://localhost:3000/api-docs");
  } catch (error) {
    console.error("Error during application bootstrap:", error);
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

bootstrap();
