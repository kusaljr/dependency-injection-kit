import { extname, resolve } from "path";
import { Context, DiKitRequest, DiKitResponse } from "./types";

export type Middleware = (
  ctx: Context,
  next: () => Promise<Response>
) => Promise<Response>;

interface RegisteredMiddleware {
  prefix: string;
  middleware: Middleware;
}

export type RouteHandler = (ctx: Context) => Response | Promise<Response>;

class Router {
  private routes: Map<string, Map<string, RouteHandler>>;

  constructor() {
    this.routes = new Map();
  }

  add(method: string, path: string, handler: RouteHandler) {
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    if (!this.routes.has(path)) {
      this.routes.set(path, new Map());
    }
    this.routes.get(path)?.set(method.toUpperCase(), handler);
  }

  find(
    method: string,
    url: URL
  ): { handler: RouteHandler | undefined; params: Record<string, string> } {
    const path = url.pathname;
    const methodRoutes = this.routes.get(path);

    if (methodRoutes?.has(method.toUpperCase())) {
      return { handler: methodRoutes.get(method.toUpperCase()), params: {} };
    }

    for (const [routePath, handlers] of this.routes.entries()) {
      if (routePath.includes(":")) {
        const routeParts = routePath.split("/");
        const pathParts = path.split("/");
        if (routeParts.length !== pathParts.length) continue;

        let match = true;
        const params: Record<string, string> = {};

        for (let i = 0; i < routeParts.length; i++) {
          if (routeParts[i].startsWith(":")) {
            params[routeParts[i].substring(1)] = pathParts[i];
          } else if (routeParts[i] !== pathParts[i]) {
            match = false;
            break;
          }
        }

        if (match && handlers.has(method.toUpperCase())) {
          return { handler: handlers.get(method.toUpperCase()), params };
        }
      }
    }
    return { handler: undefined, params: {} };
  }
}

function getContentType(path: string): string {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html";
    case ".css":
      return "text/css";
    case ".js":
      return "application/javascript";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain";
    case ".xml":
      return "application/xml";
    case ".pdf":
      return "application/pdf";
    case ".ico":
      return "image/x-icon";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".ogg":
      return "audio/ogg";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

function accepts(
  header: string | null,
  types: string | string[]
): string | false {
  if (!header) return false;
  const preferred = Array.isArray(types) ? types : [types];
  const clientAccepted = header.split(",").map((s) => s.trim().split(";")[0]); // Remove q-values for simplicity
  for (const type of preferred) {
    if (clientAccepted.includes(type) || clientAccepted.includes("*/*")) {
      return type;
    }
  }
  return false;
}

function acceptsCharsets(
  header: string | null,
  charsets: string | string[]
): string | false {
  return accepts(header, charsets);
}

function acceptsEncodings(
  header: string | null,
  encodings: string | string[]
): string | false {
  return accepts(header, encodings);
}

function acceptsLanguages(
  header: string | null,
  languages: string | string[]
): string | false {
  return accepts(header, languages);
}

async function parseBody(bunRequest: Request): Promise<any | undefined> {
  const contentType = bunRequest.headers.get("content-type");
  if (bunRequest.body && !["GET", "HEAD"].includes(bunRequest.method)) {
    if (contentType?.includes("application/json")) {
      return await bunRequest.json();
    } else if (contentType?.includes("application/x-www-form-urlencoded")) {
      const formData = await bunRequest.text();
      return Object.fromEntries(new URLSearchParams(formData));
    } else if (contentType?.includes("multipart/form-data")) {
      return await bunRequest.formData();
    } else if (contentType?.includes("text/plain")) {
      return await bunRequest.text();
    }
    // Handle other types like ArrayBuffer, Blob if needed
    // For now, if no specific parser, return raw text or buffer
    return await bunRequest.text(); // Fallback
  }
  return undefined;
}

export function wrapExpressMiddleware(
  expressMiddleware: (
    req: DiKitRequest,
    res: DiKitResponse,
    next: (err?: any) => void
  ) => void
): Middleware {
  return async (
    ctx: Context,
    bunNext: () => Promise<Response>
  ): Promise<Response> => {
    return new Promise<Response>((resolve, reject) => {
      let nextCalled = false;

      const expressReq: DiKitRequest = ctx.req;
      const expressRes: DiKitResponse = ctx.res;

      const expressNext = (err?: any) => {
        if (nextCalled) {
          console.warn(
            "[BunServe] expressNext() called more than once for a single request."
          );
          return;
        }
        nextCalled = true;

        if (err) {
          reject(err);
        } else {
          bunNext().then(resolve).catch(reject);
        }
      };

      try {
        expressMiddleware(expressReq, expressRes, expressNext);
      } catch (error) {
        reject(error);
      }
    });
  };
}

export class BunServe {
  private globalMiddlewares: RegisteredMiddleware[] = [];
  private routeMiddlewares: Map<string, Map<string, Middleware[]>> = new Map();
  private router: Router = new Router();
  private port: number;
  private hostname: string;

  constructor(options?: { port?: number; hostname?: string }) {
    this.port = options?.port || 3000;
    this.hostname = options?.hostname || "0.0.0.0";
  }

  private flattenAndWrapMiddleware(
    middlewares: (
      | string
      | Middleware
      | ((req: any, res: any, next: any) => void)
      | (string | Middleware | ((req: any, res: any, next: any) => void))[]
    )[]
  ): { prefix: string; handlers: Middleware[] } {
    let prefix = "/";
    const handlers: Middleware[] = [];

    if (typeof middlewares[0] === "string") {
      prefix = middlewares[0];
      middlewares = middlewares.slice(1);
    }

    if (prefix.length > 1 && prefix.endsWith("/")) {
      prefix = prefix.slice(0, -1);
    }
    if (prefix !== "/" && !prefix.startsWith("/")) {
      prefix = "/" + prefix;
    }

    for (const arg of middlewares) {
      if (Array.isArray(arg)) {
        const { handlers: nestedHandlers } = this.flattenAndWrapMiddleware(
          arg as (
            | string
            | Middleware
            | ((req: any, res: any, next: any) => void)
          )[]
        );
        handlers.push(...nestedHandlers);
      } else if (typeof arg === "function") {
        if (arg.length === 3) {
          handlers.push(wrapExpressMiddleware(arg as any));
        } else {
          handlers.push(arg as Middleware);
        }
      } else {
        console.warn(
          `[BunServe] Ignored invalid middleware argument: ${typeof arg}`,
          arg
        );
      }
    }

    return { prefix, handlers };
  }

  use(
    ...args: (
      | string
      | Middleware
      | ((req: any, res: any, next: any) => void)
      | (string | Middleware | ((req: any, res: any, next: any) => void))[]
    )[]
  ) {
    const { prefix, handlers } = this.flattenAndWrapMiddleware(args);
    for (const handler of handlers) {
      this.globalMiddlewares.push({ prefix, middleware: handler });
    }
    return this;
  }

  private registerRoute(
    method: string,
    path: string,
    args: (
      | Middleware
      | Middleware[]
      | RouteHandler
      | ((req: any, res: any, next: any) => void)
    )[]
  ) {
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    const finalHandler = args.pop() as RouteHandler;
    const middlewares = args as (
      | Middleware
      | Middleware[]
      | ((req: any, res: any, next: any) => void)
    )[];

    const { handlers: routeSpecificMiddlewares } =
      this.flattenAndWrapMiddleware(middlewares);

    if (!this.routeMiddlewares.has(path)) {
      this.routeMiddlewares.set(path, new Map());
    }
    this.routeMiddlewares
      .get(path)
      ?.set(method.toUpperCase(), routeSpecificMiddlewares);

    this.router.add(method, path, finalHandler);
    return this;
  }

  get(
    path: string,
    ...args: (
      | Middleware
      | Middleware[]
      | RouteHandler
      | ((req: any, res: any, next: any) => void)
    )[]
  ) {
    return this.registerRoute("GET", path, args);
  }

  post(
    path: string,
    ...args: (
      | Middleware
      | Middleware[]
      | RouteHandler
      | ((req: any, res: any, next: any) => void)
    )[]
  ) {
    return this.registerRoute("POST", path, args);
  }

  put(
    path: string,
    ...args: (
      | Middleware
      | Middleware[]
      | RouteHandler
      | ((req: any, res: any, next: any) => void)
    )[]
  ) {
    return this.registerRoute("PUT", path, args);
  }

  delete(
    path: string,
    ...args: (
      | Middleware
      | Middleware[]
      | RouteHandler
      | ((req: any, res: any, next: any) => void)
    )[]
  ) {
    return this.registerRoute("DELETE", path, args);
  }

  patch(
    path: string,
    ...args: (
      | Middleware
      | Middleware[]
      | RouteHandler
      | ((req: any, res: any, next: any) => void)
    )[]
  ) {
    return this.registerRoute("PATCH", path, args);
  }

  private async handleRequest(bunRequest: Request): Promise<Response> {
    const url = new URL(bunRequest.url);
    const method = bunRequest.method;

    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    const requestPath = url.pathname;

    const parsedBody = await parseBody(bunRequest);

    // Only serve files from /public route if not handled by a specific route
    if (requestPath.startsWith("/public")) {
      const filePath = `.${url.pathname}`;
      try {
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file, {
            headers: {
              "Content-Type": getContentType(filePath),
            },
          });
        } else {
          return new Response("File not found", { status: 404 });
        }
      } catch (err) {
        console.error("Error reading static file:", err);
        return new Response("Error reading file", { status: 500 });
      }
    }

    const { handler, params } = this.router.find(method, url);
    const query = Object.fromEntries(url.searchParams.entries());

    let currentStatusCode: number = 200;
    const currentHeaders: Record<string, string | string[]> = {};
    let responseBody:
      | string
      | Uint8Array
      | ArrayBuffer
      | ReadableStream
      | FormData
      | Blob
      | null = null;
    let responseEnded: boolean = false;
    let finalBunResponse: Response | undefined;
    const cookies: string[] = [];

    const diKitResponse: DiKitResponse = {
      statusCode: 200,
      setHeader(name: string, value: string | string[]): void {
        this.headers[name] = value;
      },
      headers: currentHeaders,
      _body: null,
      _isEnded: false,
      _bunCtx: null as any,
      headersSent(): boolean {
        return this._isEnded; // Headers are considered "sent" once end() is called
      },

      status(code: number): DiKitResponse {
        this.statusCode = code;
        currentStatusCode = code;
        return this;
      },
      sendStatus(code: number): DiKitResponse {
        this.statusCode = code;
        currentStatusCode = code;
        this.end();
        return this;
      },
      links(links: { [key: string]: string }): DiKitResponse {
        const linkHeader = Object.entries(links)
          .map(([rel, uri]) => `<${uri}>; rel="${rel}"`)
          .join(", ");
        this.set("Link", linkHeader);
        return this;
      },
      location(url: string): DiKitResponse {
        this.set("Location", url);
        return this;
      },
      redirect(url: string, status?: number): DiKitResponse {
        this.status(status || 302)
          .location(url)
          .end();
        return this;
      },
      contentType(type: string): DiKitResponse {
        this.set("Content-Type", type);
        return this;
      },
      type(type: string): DiKitResponse {
        return this.contentType(type);
      },
      vary(field: string | string[]): DiKitResponse {
        const currentVary = (this.headers["Vary"] || "") as string;
        const fields = Array.isArray(field) ? field : [field];
        const newVary = [
          ...new Set([
            ...currentVary
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            ...fields,
          ]),
        ].join(", ");
        this.set("Vary", newVary);
        return this;
      },
      append(field: string, value: string | string[]): DiKitResponse {
        const existing = this.headers[field];
        if (existing) {
          const newValue = Array.isArray(existing) ? existing : [existing];
          newValue.push(...(Array.isArray(value) ? value : [value]));
          this.set(field, newValue);
        } else {
          this.set(field, value);
        }
        return this;
      },

      send(data: any): DiKitResponse {
        if (data === null || data === undefined) {
          this._body = null;
          if (!this.headers["Content-Type"]) {
            this.set("Content-Type", "text/plain");
          }
        } else if (typeof data === "object") {
          if (!this.headers["Content-Type"]) {
            this.set("Content-Type", "application/json");
          }
          this._body = JSON.stringify(data);
        } else if (typeof data === "string") {
          if (!this.headers["Content-Type"]) {
            this.set("Content-Type", "text/html; charset=utf-8");
          }
          this._body = data;
        } else if (
          data instanceof Uint8Array ||
          data instanceof ArrayBuffer ||
          data instanceof Blob ||
          data instanceof ReadableStream ||
          data instanceof FormData
        ) {
          this._body = data;
        } else {
          // Coerce other types (number, boolean) to string
          this._body = String(data);
          if (!this.headers["Content-Type"]) {
            this.set("Content-Type", "text/plain");
          }
        }
        this.end();
        return this;
      },
      json(data: object | Array<any>): DiKitResponse {
        this.set("Content-Type", "application/json");
        this.send(JSON.stringify(data));
        return this;
      },
      jsonp(data: object | Array<any>): DiKitResponse {
        const callback = this._bunCtx.query.callback; // Assuming callback in query
        if (callback && typeof callback === "string") {
          this.set("Content-Type", "text/javascript");
          this.send(`${callback}(${JSON.stringify(data)});`);
        } else {
          this.json(data); // Fallback to normal JSON
        }
        return this;
      },
      async sendFile(
        filePath: string,
        options?: { root?: string; headers?: Record<string, string> }
      ): Promise<DiKitResponse> {
        let absolutePath = filePath;
        if (options?.root) {
          absolutePath = resolve(options.root, filePath);
        } else {
          absolutePath = resolve(filePath); // Resolve relative to CWD
        }

        try {
          const file = Bun.file(absolutePath);
          if (!(await file.exists())) {
            this.statusCode = 404;
            this.send("File not found");
            return this;
          }

          this.set("Content-Type", getContentType(absolutePath));
          if (options?.headers) {
            for (const key in options.headers) {
              this.set(key, options.headers[key]);
            }
          }

          this._body = file.stream(); // Stream the file
          this.end();
          return this;
        } catch (error: any) {
          console.error(`Error sending file ${absolutePath}:`, error);
          this.statusCode = 500;
          this.send(
            `Internal Server Error: Could not send file. ${error.message}`
          );
          return this;
        }
      },
      async download(
        filePath: string,
        filename?: string,
        options?: { root?: string; headers?: Record<string, string> }
      ): Promise<DiKitResponse> {
        let absolutePath = filePath;
        if (options?.root) {
          absolutePath = resolve(options.root, filePath);
        } else {
          absolutePath = resolve(filePath);
        }

        const effectiveFilename =
          filename || require("path").basename(absolutePath); // Use node:path
        this.set(
          "Content-Disposition",
          `attachment; filename="${effectiveFilename}"`
        );

        // Pass through to sendFile for actual file serving logic
        return await this.sendFile(filePath, options);
      },
      render(view: string, options?: object): DiKitResponse {
        // This is a placeholder for a real templating engine
        console.warn(
          `[BunServe] res.render("${view}") called. No templating engine configured.`
        );
        this.set("Content-Type", "text/html");
        this.send(
          `<h1>Template rendering not implemented: ${view}</h1><pre>${JSON.stringify(
            options,
            null,
            2
          )}</pre>`
        );
        return this;
      },
      end(data?: any): void {
        if (this._isEnded) {
          return;
        }
        if (data !== undefined) {
          this._body = data;
        }
        this._isEnded = true;
        responseEnded = true; // Signal to handleRequest that response is finalized

        // Build Bun Headers from the plain object and cookies
        const bunHeaders = new Headers();
        for (const headerName in this.headers) {
          if (
            this.headers.hasOwnProperty(headerName) &&
            this.headers[headerName] !== undefined
          ) {
            const value = this.headers[headerName];
            if (Array.isArray(value)) {
              value.forEach((v) => bunHeaders.append(headerName, v));
            } else {
              bunHeaders.set(headerName, value);
            }
          }
        }
        cookies.forEach((cookie) => bunHeaders.append("Set-Cookie", cookie));

        // Finalize the body for Bun's Response constructor
        const finalBody =
          this._body === null ||
          this._body instanceof Uint8Array ||
          this._body instanceof ArrayBuffer ||
          this._body instanceof ReadableStream ||
          this._body instanceof FormData ||
          this._body instanceof Blob
            ? this._body
            : String(this._body);

        finalBunResponse = new Response(finalBody, {
          status: currentStatusCode,
          headers: bunHeaders,
        });
      },
      set(name: string, value: string | string[]): DiKitResponse {
        this.headers[name] = value;
        return this;
      },
      header(name: string, value: string | string[]): DiKitResponse {
        return this.set(name, value);
      },
      get(name: string): string | undefined {
        const value = this.headers[name];
        if (Array.isArray(value)) {
          return value.join(", "); // Join array values for string retrieval
        }
        return value as string | undefined;
      },
      cookie(
        name: string,
        value: string,
        options?: {
          domain?: string;
          expires?: Date;
          httpOnly?: boolean;
          maxAge?: number;
          path?: string;
          secure?: boolean;
          signed?: boolean;
          sameSite?: "strict" | "lax" | "none";
        }
      ): DiKitResponse {
        let cookieString = `${name}=${encodeURIComponent(value)}`;
        if (options) {
          if (options.domain) cookieString += `; Domain=${options.domain}`;
          if (options.expires)
            cookieString += `; Expires=${options.expires.toUTCString()}`;
          if (options.httpOnly) cookieString += `; HttpOnly`;
          if (options.maxAge) cookieString += `; Max-Age=${options.maxAge}`;
          if (options.path) cookieString += `; Path=${options.path}`;
          if (options.secure) cookieString += `; Secure`;
          if (options.sameSite)
            cookieString += `; SameSite=${options.sameSite}`;
          // `signed` is a feature for actual Express (uses cookie-signature),
          // not implemented here directly for BunServe's core.
        }
        cookies.push(cookieString); // Store cookie string
        return this;
      },
      clearCookie(name: string, options?: { path?: string }): DiKitResponse {
        this.cookie(name, "", { ...options, expires: new Date(0) });
        return this;
      },
      etag(val: string | Buffer): DiKitResponse {
        // Simple Etag generation (could use a dedicated hashing lib)
        const tag = `"${Bun.hash(val).toString(16)}"`;
        this.set("ETag", tag);
        return this;
      },
      lastModified(date: Date): DiKitResponse {
        this.set("Last-Modified", date.toUTCString());
        return this;
      },
    };

    // --- Construct the DiKitRequest object ---
    const diKitRequest: DiKitRequest = {
      url: bunRequest.url,
      ip: bunRequest.headers.get("x-forwarded-for") || "::1",
      originalUrl: bunRequest.url,
      baseUrl: "", // For sub-routers, would need more complex logic
      path: url.pathname.split("?")[0],
      method: bunRequest.method,
      headers: Object.fromEntries(bunRequest.headers.entries()),
      query: query,
      params: params,
      body: parsedBody,
      // Implement Express-like request methods
      accepts(types?: string | string[]): string | false {
        return accepts(
          (this.headers["accept"] as string) || null,
          types || ["*/*"]
        );
      },
      acceptsCharsets(charsets?: string | string[]): string | false {
        return acceptsCharsets(
          (this.headers["accept-charset"] as string) || null,
          charsets || ["*"]
        );
      },
      acceptsEncodings(encodings?: string | string[]): string | false {
        return acceptsEncodings(
          (this.headers["accept-encoding"] as string) || null,
          encodings || ["identity"]
        );
      },
      acceptsLanguages(languages?: string | string[]): string | false {
        return acceptsLanguages(
          (this.headers["accept-language"] as string) || null,
          languages || ["*"]
        );
      },
      get(name: string): string | undefined {
        const header = this.headers[name.toLowerCase()];
        if (Array.isArray(header)) {
          return header.join(", ");
        }
        return header as string | undefined;
      },
      is(type: string): string | false {
        const contentTypeHeader = this.headers["content-type"] as string;
        if (!contentTypeHeader) return false;
        // Simple check: does the content type include the given type string
        return contentTypeHeader.includes(type) ? type : false;
      },
    };

    const ctx: Context = {
      req: diKitRequest,
      res: diKitResponse, // Assign the fully functional DiKitResponse
      params,
      query,
      body: parsedBody,
      locals: {},
      seoMeta: undefined,

      // These Context methods now delegate to ctx.res for consistency
      statusCode: currentStatusCode, // Initial value
      headers: new Headers(), // Will be populated by ctx.res._bunCtx.headers

      status(code: number): Context {
        this.res.status(code);
        this.statusCode = code; // Keep Context's statusCode in sync
        return this;
      },
      headersSent(): boolean {
        return this.res._isEnded; // Delegate to DiKitResponse's internal state
      },
      send(data: any): Response {
        this.res.send(data);
        return finalBunResponse || new Response("No Content", { status: 204 });
      },
      file(filePath, options) {
        // This is a direct BunServe utility for static files, distinct from res.sendFile
        const absolutePath = resolve(filePath);
        try {
          const file = Bun.file(absolutePath);
          if (!Bun.file(absolutePath)) {
            // Check if file exists, though Bun.file doesn't throw for non-existent path immediately
            console.warn(
              `[BunServe] ctx.file: File not found at ${absolutePath}`
            );
            return new Response("File not found", { status: 404 });
          }
          const responseHeaders = new Headers();
          responseHeaders.set("Content-Type", getContentType(absolutePath));
          if (options?.headers) {
            for (const key in options.headers) {
              responseHeaders.set(key, options.headers[key]);
            }
          }
          this._finalBunResponse = new Response(file, {
            status: this.statusCode,
            headers: responseHeaders,
          });
          return this._finalBunResponse;
        } catch (err) {
          console.error(
            `[BunServe] ctx.file: Error reading file ${absolutePath}:`,
            err
          );
          return new Response("Error reading file", { status: 500 });
        }
      },
      json(data: object | Array<any>): Response {
        this.res.json(data);
        return finalBunResponse || new Response("No Content", { status: 204 });
      },
      set(name: string, value: string | string[]): Context {
        this.res.set(name, value);
        // Ensure Context's internal headers are also updated for eventual Bun.Response construction
        if (Array.isArray(value)) {
          value.forEach((v) => this.headers.append(name, v));
        } else {
          this.headers.set(name, value);
        }
        return this;
      },
      setHeader(name: string, value: string | string[]): Context {
        return this.set(name, value);
      },
      _finalBunResponse: undefined, // Will be set when res.end() or ctx.file() is called
    };

    // Link the DiKitResponse back to its Context
    diKitResponse._bunCtx = ctx;

    const allApplicableMiddlewares: Middleware[] = [];

    this.globalMiddlewares.forEach((mw) => {
      if (requestPath.startsWith(mw.prefix)) {
        allApplicableMiddlewares.push(mw.middleware);
      }
    });

    if (handler) {
      const routeSpecificMWs = this.routeMiddlewares
        .get(requestPath)
        ?.get(method.toUpperCase());
      if (routeSpecificMWs) {
        allApplicableMiddlewares.push(...routeSpecificMWs);
      }
    }

    let middlewareIndex = 0;

    const next = async (): Promise<Response> => {
      // If DiKitResponse's end() was called, return the finalized Bun Response
      if (diKitResponse._isEnded && finalBunResponse) {
        return finalBunResponse;
      }

      if (middlewareIndex < allApplicableMiddlewares.length) {
        const currentMiddleware = allApplicableMiddlewares[middlewareIndex++];
        // Call middleware, which might use ctx.res methods or call next()
        const responseFromMiddleware = await currentMiddleware(ctx, next);

        // Prioritize response returned by middleware, then finalized Bun Response
        return (
          responseFromMiddleware ||
          finalBunResponse ||
          new Response("", { status: 404 })
        );
      } else {
        if (handler) {
          try {
            const result = await handler(ctx);
            // Prioritize response returned by handler, then finalized Bun Response
            return result instanceof Response
              ? result
              : finalBunResponse || new Response("", { status: 404 });
          } catch (error: any) {
            console.error("Route handler error:", error);
            // If an error occurs in the handler, ensure the response is ended
            if (!diKitResponse._isEnded) {
              diKitResponse
                .status(500)
                .send(`Internal Server Error: ${error.message}`);
            }
            return (
              finalBunResponse ||
              new Response(`Internal Server Error: ${error.message}`, {
                status: 500,
              })
            );
          }
        } else {
          // If no handler and no response ended, return 404
          if (!diKitResponse._isEnded) {
            diKitResponse.status(404).send("Not Found");
          }
          return finalBunResponse || new Response("Not Found", { status: 404 });
        }
      }
    };

    try {
      const finalResponse = await next();
      // If somehow no response was generated by the chain, ensure a 404
      if (
        !finalResponse ||
        (finalResponse.status === 404 && !diKitResponse._isEnded)
      ) {
        diKitResponse.status(404).send("Not Found");
        return finalBunResponse || new Response("Not Found", { status: 404 });
      }
      return finalResponse;
    } catch (error: any) {
      console.error("Middleware chain error:", error);
      if (!diKitResponse._isEnded) {
        diKitResponse
          .status(500)
          .send(`Internal Server Error: ${error.message}`);
      }
      return (
        finalBunResponse ||
        new Response(`Internal Server Error: ${error.message}`, {
          status: 500,
        })
      );
    }
  }

  listen(callback?: () => void) {
    Bun.serve({
      port: this.port,
      hostname: this.hostname,
      fetch: this.handleRequest.bind(this) as any,
      error(error: Error) {
        console.error("Bun server error:", error);
        return new Response(`Server Error: ${error.message}`, { status: 500 });
      },
    });

    if (callback) {
      callback();
    }
    console.log(
      `🦊 BunServe listening on http://${this.hostname}:${this.port}`
    );
  }
}

// Ensure Bun.hash is available if used, or polyfill/remove if targeting non-Bun environments
// If using Node.js, you'd replace Bun.file/Bun.serve/Bun.hash with Node.js equivalents.
// For example, for crypto.createHash for etag, fs for file operations, http/https for server.
