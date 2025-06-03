import { z } from "zod";
import { registerControllers } from "../utils/auto-router";
import { generateEnvConfig } from "../utils/env-generator";
import {
  collectControllersForSwagger,
  generateSwaggerDoc,
} from "../utils/swagger-generator";
import { Container } from "./container";

import { BunServe, Context } from "@express-di-kit/bun-engine/exp";
import { serveSwagger } from "@express-di-kit/swagger/route";
import {
  collectSocketControllersForAsyncAPI,
  generateAsyncAPIDoc,
} from "../utils/async-api.generator";
import "./injection";

export interface AppConfig {
  port: number;
  envSchema: z.ZodObject<any>;
  swaggerOptions?: {
    title: string;
    version: string;
    description: string;
  };
  asyncApiOptions?: {
    title: string;
    version?: string;
    serverUrl?: string;
    description?: string;
    serverDescription?: string;
  };
}

export async function createApp(config: AppConfig) {
  const app = new BunServe();
  const container = Container.getInstance();

  generateEnvConfig(config.envSchema);

  const controllersDirectory = process.cwd() + "/src";
  await registerControllers(app, controllersDirectory, container);

  if (config.asyncApiOptions) {
    const {
      title,
      version = "0.1",
      description,
      serverUrl,
      serverDescription,
    } = config.asyncApiOptions;

    const socketControllerClasses = await collectSocketControllersForAsyncAPI(
      controllersDirectory
    );

    const asyncAPIDocument = generateAsyncAPIDoc(socketControllerClasses, {
      title,
      version,
      description,
      serverUrl,
      serverDescription,
    });

    // Serve AsyncAPI JSON spec
    app.get("/asyncapi.json", async (ctx: Context) => {
      return ctx.json(asyncAPIDocument);
    });

    // Alternative: Serve using AsyncAPI React Component (self-hosted)
    app.get("/socket-docs", async (ctx: Context) => {
      return ctx.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title} - WebSocket API Documentation</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="https://unpkg.com/@asyncapi/react-component@1.4.8/styles/default.min.css">
            <style>
              body {
                margin: 0;
                padding: 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                background: #f8fafc;
              }
              .container {
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                overflow: hidden;
              }
              .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 2rem;
                text-align: center;
              }
              .header h1 { margin: 0 0 0.5rem 0; font-size: 2rem; }
              .header p { margin: 0; opacity: 0.9; }
              #asyncapi { padding: 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>${title}</h1>
                    <p>WebSocket API Documentation - Version ${version}</p>
                </div>
                <div id="asyncapi"></div>
            </div>
            <script src="https://unpkg.com/@asyncapi/react-component@1.4.8/browser/standalone/index.js"></script>
            <script>
                AsyncApiStandalone.render({
                    schema: ${JSON.stringify(asyncAPIDocument)},
                    config: {
                        show: {
                            sidebar: true,
                            info: true,
                            servers: true,
                            operations: true,
                            messages: true,
                            schemas: true
                        },
                        sidebar: {
                            showOperations: 'byDefault'
                        }
                    }
                }, document.getElementById('asyncapi'));
            </script>
        </body>
        </html>
      `);
    });

    console.log(`  - Socket Docs: http://localhost:3000/socket-docs`);
    console.log(`  - JSON spec: http://localhost:3000/asyncapi.json`);
  }

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

    serveSwagger(app, "/api-docs", swaggerDocument, {});

    console.log("Swagger UI available at http://localhost:3000/api-docs");
  }

  return app;
}
