import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

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

  const result = await Bun.build({
    entrypoints: [tempFilePath],
    outdir: "public",
    target: "browser",
    format: "esm",
  });

  await fs.unlink(tempFilePath);

  for (const res of result.outputs) {
    const jsOutputPath = path.join("public", "index.js");
    await fs.writeFile(jsOutputPath, await res.text(), "utf8");
    await fs.unlink(res.path);

    // Generate a basic HTML file that injects props and loads the JS
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>React View</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script>window.__REACT_PROPS__ = ${propsJSON};</script>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/public/index.js"></script>
      </body>
      </html>
    `;

    const htmlPath = path.join("public", "index.html");
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
