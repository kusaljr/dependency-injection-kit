import { BunServe } from "@express-di-kit/bun-engine";
import { Context } from "@express-di-kit/bun-engine/types";
import * as fs from "fs";
import { generateHTML, generateSwaggerInitJs, getSwaggerAssetMap } from ".";
import { SwaggerUiOptions } from "./types";

export function serveSwagger(
  app: BunServe,
  route: string,
  swaggerDoc: any,
  swaggerUiOptions: SwaggerUiOptions
) {
  const swaggerHtml = generateHTML(swaggerDoc, swaggerUiOptions);
  const swaggerInitJsContent = generateSwaggerInitJs(
    swaggerDoc,
    swaggerUiOptions
  );
  const swaggerAssetMap = getSwaggerAssetMap();

  app.get(route, (ctx: Context) => {
    ctx.setHeader("Content-Type", "text/html");
    ctx.send(swaggerHtml);
  });

  app.get("/swagger-ui-init.js", (ctx: Context) => {
    ctx.setHeader("Content-Type", "application/javascript");
    ctx.send(swaggerInitJsContent);
  });

  // Serve static Swagger UI assets
  app.get("/swagger-ui-assets/swagger-ui.css", (ctx: Context) => {
    const filePath = swaggerAssetMap.get("swagger-ui.css");
    if (filePath && fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        ctx.setHeader("Content-Type", "text/css");
        ctx.send(content);
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        ctx.status(500);
        ctx.send("Internal Server Error");
      }
    } else {
      ctx.status(404);
      ctx.send("Not Found");
    }
  });

  app.get("/swagger-ui-assets/swagger-ui-bundle.js", (ctx: Context) => {
    const filePath = swaggerAssetMap.get("swagger-ui-bundle.js");
    if (filePath && fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        ctx.setHeader("Content-Type", "application/javascript");
        ctx.send(content);
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        ctx.status(500);
        ctx.send("Internal Server Error");
      }
    } else {
      ctx.status(404);
      ctx.send("Not Found");
    }
  });

  app.get(
    "/swagger-ui-assets/swagger-ui-standalone-preset.js",
    (ctx: Context) => {
      const filePath = swaggerAssetMap.get("swagger-ui-standalone-preset.js");
      if (filePath && fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          ctx.setHeader("Content-Type", "application/javascript");
          ctx.send(content);
        } catch (error) {
          console.error(`Error reading file ${filePath}:`, error);
          ctx.status(500);
          ctx.send("Internal Server Error");
        }
      } else {
        ctx.status(404);
        ctx.send("Not Found");
      }
    }
  );
}
