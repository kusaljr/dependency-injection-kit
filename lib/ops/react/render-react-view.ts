import * as babel from "@babel/core";
import * as fs from "fs";
import path from "path";

export function renderReactView(
  componentFilePath: string,
  data: Record<string, any> = {}
): string {
  const componentCode = fs.readFileSync(componentFilePath, "utf8");

  let transpiledComponentCode: string;
  try {
    const result = babel.transformSync(componentCode, {
      presets: [
        ["@babel/preset-env", { modules: false }],
        "@babel/preset-react",
      ],
      plugins: [],
      filename: componentFilePath,
      sourceType: "module",
      retainLines: true,
    });

    if (!result || !result.code) {
      throw new Error("Babel transformation failed: No output code.");
    }

    transpiledComponentCode = result.code;
  } catch (error) {
    console.error(
      `Error transpiling component with Babel: ${
        (error as { message: string }).message
      }`
    );
    return `<h1>Error: Could not render component. Check server logs.</h1>`;
  }

  const serializedProps = JSON.stringify(data);

  const importMap = fs.readFileSync("react-importmap.json", "utf8");

  const componentName = (componentFilePath.split("/").pop() || "")
    .replace(/\.[^/.]+$/, "")
    // replace . with _ to avoid issues with React.createElement
    .replace(/\./g, "_");

  // find external imports in the transpiled code
  const externalImports = (
    transpiledComponentCode.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g) ||
    []
  ).filter((imp) => /from\s+['"](\.\/|\.\.\/)/.test(imp));

  // Remove local imports from the transpiled code
  externalImports.forEach((imp) => {
    const importPath = imp.match(/from\s+['"]([^'"]+)['"]/);
    if (importPath && importPath[1]) {
      const localImport = new RegExp(
        `import\\s+.*?\\s+from\\s+['"]${importPath[1]}['"]`,
        "g"
      );
      transpiledComponentCode = transpiledComponentCode.replace(
        localImport,
        ""
      );
    }
  });

  const componentNameMatch = transpiledComponentCode.match(
    /export\s+default\s+(\w+)/
  );
  if (!componentNameMatch || !componentNameMatch[1]) {
    console.error(
      `Error: Could not find the default export in the component file ${componentFilePath}.`
    );
    return `<h1>Error: Could not render component. Check server logs.</h1>`;
  }

  // find external imports code from the file system
  externalImports.forEach((imp) => {
    const importPath = imp.match(/from\s+['"]([^'"]+)['"]/);
    if (importPath && importPath[1]) {
      const externalFilePath = importPath[1].startsWith(".")
        ? path.resolve(path.dirname(componentFilePath), importPath[1])
        : importPath[1];

      // transpile the external file and append it to the transpiled code
      try {
        const externalCode = fs.readFileSync(externalFilePath + ".jsx", "utf8");
        const externalResult = babel.transformSync(externalCode, {
          presets: [
            ["@babel/preset-env", { modules: false }],
            "@babel/preset-react",
          ],
          plugins: [],
          filename: externalFilePath,
          sourceType: "module",
          retainLines: true,
        });

        if (externalResult && externalResult.code) {
          transpiledComponentCode += `\n${externalResult.code}`;
        } else {
          console.warn(
            `Warning: Could not transpile external file ${externalFilePath}.`
          );
        }
      } catch (error) {
        console.error(
          `Error reading or transpiling external file ${externalFilePath}: ${
            (error as { message: string }).message
          }`
        );
      }
    }
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>React Component View</title>

  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>

  <script type="importmap">
    ${importMap}
  </script>
</head>
<body>
  <div id="root"></div>

  <script>
    window.__PROPS__ = ${serializedProps};
  </script>

  <script type="module">
    ${transpiledComponentCode}

    import React from "react";
    import ReactDOM from "react-dom/client";

    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(React.createElement(${componentName}, window.__PROPS__));
  </script>
</body>
</html>
`.trim();
}
