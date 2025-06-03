import * as fs from "fs";
import * as path from "path";
import getAbsoluteSwaggerFsPath from "swagger-ui-dist/absolute-path";
import { favIconHtml, htmlTplString, jsTplString } from "./templates";
import { SwaggerOptions, SwaggerUiOptions } from "./types";
import {
  stringify,
  toExternalScriptTag,
  toExternalStylesheetTag,
  toInlineScriptTag,
  toTags,
} from "./utils";

/**
 * Generates the HTML string for Swagger UI.
 * @param swaggerDoc The Swagger/OpenAPI document.
 * @param opts Options for customizing Swagger UI.
 * @returns The generated HTML string.
 */
export function generateHTML(
  swaggerDoc: Record<string, any> | undefined,
  opts?: SwaggerUiOptions
): string {
  const options: SwaggerOptions = opts?.swaggerOptions || {};
  let customCss = opts?.customCss || "";
  const customJs = opts?.customJs;
  const customJsStr = opts?.customJsStr;
  const customfavIcon = opts?.customfavIcon || false;
  const customRobots = opts?.customRobots;
  const swaggerUrl = opts?.swaggerUrl;
  const swaggerUrls = opts?.swaggerUrls;
  const isExplorer = opts?.explorer || !!swaggerUrls;
  const customSiteTitle = opts?.customSiteTitle || "Swagger UI";
  const customCssUrl = opts?.customCssUrl;

  const explorerString = isExplorer
    ? ""
    : ".swagger-ui .topbar .download-url-wrapper { display: none }";
  customCss = explorerString + " " + customCss;
  const robotsMetaString = customRobots
    ? `<meta name="robots" content="${customRobots}" />`
    : "";
  const favIconString = customfavIcon
    ? `<link rel="icon" href="${customfavIcon}" />`
    : favIconHtml;

  let html = htmlTplString.replace("<% customCss %>", customCss);
  html = html.replace("<% robotsMetaString %>", robotsMetaString);
  html = html.replace("<% favIconString %>", favIconString);
  html = html.replace("<% customJs %>", toTags(customJs, toExternalScriptTag));
  html = html.replace(
    "<% customJsStr %>",
    toTags(customJsStr, toInlineScriptTag)
  );
  html = html.replace(
    "<% customCssUrl %>",
    toTags(customCssUrl, toExternalStylesheetTag)
  );

  const initOptions: SwaggerOptions = {
    swaggerDoc: swaggerDoc,
    customOptions: options,
    swaggerUrl: swaggerUrl,
    swaggerUrls: swaggerUrls,
  };

  const swaggerInitScript = jsTplString.replace(
    "<% swaggerOptions %>",
    stringify(initOptions)
  );
  // Replace the placeholder for the init script. This will be served separately.
  // We'll indicate in the HTML that swagger-ui-init.js is available at a specific path.
  html = html.replace('<script src="./swagger-ui-init.js"> </script>', ""); // Remove the original script tag
  html = html.replace(
    "</body>",
    `<script>${swaggerInitScript}</script></body>`
  ); // Embed the script directly

  return html.replace("<% title %>", customSiteTitle);
}

/**
 * Generates the content for the `swagger-ui-init.js` file.
 * @param swaggerDoc The Swagger/OpenAPI document.
 * @param opts Options for customizing Swagger UI.
 * @returns The JavaScript content for `swagger-ui-init.js`.
 */
export function generateSwaggerInitJs(
  swaggerDoc: Record<string, any> | undefined,
  opts?: SwaggerUiOptions
): string {
  const options: SwaggerOptions = opts?.swaggerOptions || {};
  const swaggerUrl = opts?.swaggerUrl;
  const swaggerUrls = opts?.swaggerUrls;

  const initOptions: SwaggerOptions = {
    swaggerDoc: swaggerDoc,
    customOptions: options,
    swaggerUrl: swaggerUrl,
    swaggerUrls: swaggerUrls,
  };
  return jsTplString.replace("<% swaggerOptions %>", stringify(initOptions));
}

/**
 * Returns an array of paths to the static Swagger UI assets.
 * You'll need to serve these files from your HTTP server.
 * @returns An array of absolute paths to Swagger UI assets.
 */
export function getSwaggerAssetPaths(): string[] {
  const swaggerFsPath = getAbsoluteSwaggerFsPath();
  // Get all files and subdirectories
  const files = fs.readdirSync(swaggerFsPath, { recursive: true });

  const assetPaths: string[] = [];
  for (const file of files) {
    const fullPath = path.join(swaggerFsPath, file as string);
    if (fs.statSync(fullPath).isFile()) {
      assetPaths.push(fullPath);
    }
  }
  return assetPaths;
}

/**
 * Provides a mapping of public facing URLs to their corresponding absolute file paths for Swagger UI assets.
 * This is useful for custom server implementations where you map URLs to file system paths.
 * @returns A Map where keys are relative URLs (e.g., 'swagger-ui.css') and values are absolute file paths.
 */
export function getSwaggerAssetMap(): Map<string, string> {
  const swaggerFsPath = getAbsoluteSwaggerFsPath();
  const assetMap = new Map<string, string>();

  const files = fs.readdirSync(swaggerFsPath, { recursive: true });

  for (const file of files) {
    const fullPath = path.join(swaggerFsPath, file as string);
    if (fs.statSync(fullPath).isFile()) {
      // Create a URL path relative to the Swagger UI root
      const relativeUrlPath = path
        .relative(swaggerFsPath, fullPath)
        .replace(/\\/g, "/");
      assetMap.set(relativeUrlPath, fullPath);
    }
  }

  // Add favicon if it's not already in the dist folder
  // The original code uses `favicon-32x32.png` and `favicon-16x16.png` directly,
  // which implies they are expected to be in the same directory as other assets.
  // `swagger-ui-dist` itself usually includes these.
  // If your favicon needs to be custom and not part of the dist, you'd handle it separately.

  return assetMap;
}
