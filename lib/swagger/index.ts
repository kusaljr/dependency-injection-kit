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

  html = html.replace('<script src="./swagger-ui-init.js"> </script>', "");
  html = html.replace(
    "</body>",
    `<script>${swaggerInitScript}</script></body>`
  );

  return html.replace("<% title %>", customSiteTitle);
}

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

export function getSwaggerAssetPaths(): string[] {
  const swaggerFsPath = getAbsoluteSwaggerFsPath();
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

export function getSwaggerAssetMap(): Map<string, string> {
  const swaggerFsPath = getAbsoluteSwaggerFsPath();
  const assetMap = new Map<string, string>();

  const files = fs.readdirSync(swaggerFsPath, { recursive: true });

  for (const file of files) {
    const fullPath = path.join(swaggerFsPath, file as string);
    if (fs.statSync(fullPath).isFile()) {
      const relativeUrlPath = path
        .relative(swaggerFsPath, fullPath)
        .replace(/\\/g, "/");
      assetMap.set(relativeUrlPath, fullPath);
    }
  }

  return assetMap;
}
