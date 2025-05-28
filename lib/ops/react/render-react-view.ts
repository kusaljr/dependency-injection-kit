import * as fs from "fs";
import * as path from "path";

export function renderReactView(
  componentFilePath: string,
  data: Record<string, any>
): string {
  const componentCode = fs.readFileSync(componentFilePath, "utf8");

  const componentName = path
    .basename(componentFilePath, ".jsx")
    .replace(/[.\-\s]/g, "_");

  const importMapPath = path.resolve("react-importmap.json");
  let importMapScript = "";
  if (fs.existsSync(importMapPath)) {
    const importMap = fs.readFileSync(importMapPath, "utf8");
    importMapScript = `<script type="importmap">\n${importMap}\n</script>`;
  }

  return `
<!DOCTYPE html>
<html>
  <head>
    <title>React View</title>
    ${importMapScript}
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__PROPS__ = ${JSON.stringify(data)};
    </script>
    <script type="text/babel">
      ${componentCode}

      const rootElement = document.getElementById('root');
      if (rootElement) {
        ReactDOM.render(
          React.createElement(${componentName}),
          rootElement
        );
      } else {
        console.error('Root element not found');
      }
    </script>
  </body>
</html>
  `.trim();
}
