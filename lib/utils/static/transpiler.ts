import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execPromise = promisify(exec);

export async function transpileReactView(
  componentFilePath: string,
  props: Record<string, any>
) {
  const propsJSON = JSON.stringify(props ?? {}, null, 2);
  const tempId = `react-view-${randomUUID()}`;
  const tempFilePath = path.join(
    path.dirname(componentFilePath),
    `${tempId}.tsx`
  );
  const browserSafeComponentPath = path
    .resolve(componentFilePath)
    .replace(/\\/g, "/");

  // Create injected TSX entrypoint
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

  await fs.writeFile(tempFilePath, injectedContent, "utf8");

  // Transpile TSX to JS using Bun
  const result = await Bun.build({
    entrypoints: [tempFilePath],
    outdir: "public",
    target: "browser",
    format: "esm",
    minify: true,
    splitting: true,
  });

  await fs.unlink(tempFilePath);

  // Build Tailwind CSS dynamically
  const tailwindInputPath = path.join("public", `tailwind-${tempId}.css`);
  const tailwindOutputPath = path.join("public", "index.css");

  await fs.writeFile(
    tailwindInputPath,
    `@tailwind base;\n@tailwind components;\n@tailwind utilities;`,
    "utf8"
  );

  try {
    await execPromise(
      `npx tailwindcss -i ${tailwindInputPath} -o ${tailwindOutputPath} --content ${componentFilePath}`
    );
    await fs.unlink(tailwindInputPath);
  } catch (err) {
    console.error("Tailwind CSS build failed:", err);
    return {
      success: false,
      error: "Tailwind CSS build failed",
    };
  }

  // Write output JS and HTML
  for (const res of result.outputs) {
    const jsOutputPath = path.join("public", "index.js");
    await fs.writeFile(jsOutputPath, await res.text(), "utf8");
    await fs.unlink(res.path);

    const htmlPath = path.join("public", "index.html");
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>React View</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="/public/index.css" />
        <script>window.__REACT_PROPS__ = ${propsJSON};</script>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/public/index.js"></script>
      </body>
      </html>
    `;

    await fs.writeFile(htmlPath, html, "utf8");

    return {
      success: true,
      path: htmlPath,
    };
  }

  return {
    success: false,
    error: "No output generated",
  };
}
