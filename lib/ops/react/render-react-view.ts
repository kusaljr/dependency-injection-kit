import * as babel from "@babel/core";
import * as fs from "fs";

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

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>React Component View</title>

  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />

  <script type="importmap">
    ${importMap}
  </script>
</head>
<body>
  <div id="root" style="height: 100vh; width: 100vw;"></div>

  <script>
    window.__PROPS__ = ${serializedProps};
  </script>

  <script type="module">
    ${transpiledComponentCode}

    import React from "react";
    import ReactDOM from "react-dom/client";
    import L from "leaflet";

    if (typeof L !== "undefined" && L.Icon && L.Icon.Default) {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
      });
    }

    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(React.createElement(UserController_getUserList));
  </script>
</body>
</html>
`.trim();
}
