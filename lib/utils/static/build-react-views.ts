import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import * as ts from "typescript";
const execPromise = promisify(exec);

interface ReactRoute {
  controllerName: string;
  handlerName: string;
  tsxFilePath: string;
}

/**
 * Recursively find all *.controller.ts files
 */
async function getControllerFiles(dir: string): Promise<string[]> {
  let results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await getControllerFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Parse a controller file and find @React methods
 */
async function extractReactRoutes(
  controllerPath: string
): Promise<ReactRoute[]> {
  const sourceCode = await fs.readFile(controllerPath, "utf8");
  const sourceFile = ts.createSourceFile(
    controllerPath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const routes: ReactRoute[] = [];

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.name) {
      const controllerName = node.name.text;
      for (const member of node.members) {
        if (
          ts.isMethodDeclaration(member) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          const handlerName = member.name.text;
          const decorators = ts.canHaveDecorators(member)
            ? ts.getDecorators(member)
            : undefined;
          if (decorators) {
            for (const decorator of decorators) {
              const expr = decorator.expression;
              if (
                ts.isCallExpression(expr) &&
                ts.isIdentifier(expr.expression)
              ) {
                if (expr.expression.text === "React") {
                  const tsxFilePath = path.join(
                    path.dirname(controllerPath),
                    "views",
                    `${controllerName}.${handlerName}.tsx`
                  );
                  routes.push({ controllerName, handlerName, tsxFilePath });
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return routes;
}

/**
 * Transpile React view
 */
async function transpileReactComponent(route: ReactRoute) {
  const tempFilePath = path.join(
    "src",
    "temp",
    `${route.controllerName}.${route.handlerName}.entry.tsx`
  );
  const browserSafeComponentPath = path
    .resolve(route.tsxFilePath)
    .replace(/\\/g, "/");

  const injectedContent = `
    import React from "react";
    import ReactDOM from "react-dom/client";
    import Component from "${browserSafeComponentPath}";

    const root = document.getElementById("root");
    const props = window.__REACT_PROPS__;

    if (root) {
      ReactDOM.createRoot(root).render(<Component props={props} />);
    }
  `;

  await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
  await fs.writeFile(tempFilePath, injectedContent, "utf8");

  await Bun.build({
    entrypoints: [tempFilePath],
    outdir: "public",
    target: "browser",
    format: "esm",
    minify: true,
    splitting: true,
  });

  await fs.unlink(tempFilePath);
}

/**
 * Build all React views
 */
async function buildAllReactViews() {
  console.log("🔍 Scanning for controllers...");
  const controllerFiles = await getControllerFiles("src");

  let allRoutes: ReactRoute[] = [];

  for (const file of controllerFiles) {
    console.log(`🔍 Parsing ${file}`);
    const routes = await extractReactRoutes(file);
    allRoutes = allRoutes.concat(routes);
  }

  if (allRoutes.length === 0) {
    console.warn("⚠ No @React methods found.");
  }

  console.log("📦 Building Tailwind CSS...");
  await execPromise(
    `npx tailwindcss -i src/global.css -o public/index.css --content "src/**/*.tsx"`
  );

  for (const route of allRoutes) {
    console.log(
      `📦 Building React JS for ${route.controllerName}.${route.handlerName}...`
    );
    await transpileReactComponent(route);
  }

  console.log("✅ Build complete!");
}

buildAllReactViews().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
