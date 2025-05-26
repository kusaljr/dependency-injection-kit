import path from "path";
import React from "react";
import ReactDOMServer from "react-dom/server";

export async function renderReactView(
  componentFile: string,
  props: Record<string, any>
): Promise<string> {
  const componentPath = path.resolve(componentFile);
  const Component = require(componentPath).default;

  const html = ReactDOMServer.renderToString(
    React.createElement(Component, props)
  );
  return `
    <!DOCTYPE html>
    <html>
      <head><title>React View</title></head>
      <body><div id="root">${html}</div></body>
    </html>
  `;
}
