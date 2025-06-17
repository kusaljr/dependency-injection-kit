import { SeoMeta } from "@express-di-kit/static/decorator";

export function generateDynamicHtml(
  jsFile: string,
  props: unknown,
  seoMeta?: SeoMeta
): string {
  const propsJSON = JSON.stringify(props ?? {});

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="stylesheet" href="/public/index.css" />
      <title>
        ${seoMeta?.title || "Express DI Kit React View"}
      </title>
      <script>window.__REACT_PROPS__ = ${propsJSON};</script>
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="/public/${jsFile}"></script>
    </body>
    </html>
  `;
}
