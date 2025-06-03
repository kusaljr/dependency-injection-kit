export interface Context {
  req: ExpressReq;
  _response?: Response;
  params: Record<string, string>;
  query: Record<string, string>;
  body?: any; // The parsed body will be stored here
  locals: Record<string, any>;

  statusCode: number;
  headers: Headers;

  status(code: number): Context;
  headersSent(): boolean;
  send(
    data:
      | string
      | Uint8Array
      | ArrayBuffer
      | ReadableStream
      | FormData
      | Blob
      | null
  ): Response;
  file(
    filePath: string,
    options?: { headers?: Record<string, string> }
  ): Response;
  json(data: object | Array<any>): Response;
  set(name: string, value: string): Context;
  setHeader(name: string, value: string): Context;
}

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
    // Normalize the path here when adding a route
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
    url: URL // url.pathname is expected to be normalized by the caller
  ): { handler: RouteHandler | undefined; params: Record<string, string> } {
    const path = url.pathname; // This `path` should already be normalized by `handleRequest`
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

// --- NEW: Shim for Express-style middleware ---
type ExpressReq = {
  url: string;
  accepts: string | string[];
  originalUrl?: string;
  baseUrl?: string; // Important for nested routers/middleware
  path: string;
  method: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string>;
  params: Record<string, string>;
  body?: any; // This will now hold the parsed body
  [key: string]: any; // Allow arbitrary properties
};

type ExpressRes = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  _body?: any;
  _isEnded: boolean;
  status(code: number): ExpressRes;
  sendStatus(code: number): ExpressRes;
  json(data: any): ExpressRes;
  send(data: any): ExpressRes;
  setHeader(name: string, value: string): void;
  end(data?: any): void;
  [key: string]: any;
};

// Helper function to get content type based on file extension
function getContentType(path: string): string {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

// This function wraps an Express-style middleware (req, res, next)
// so it can be used within our BunServe (Context, next) chain.
function wrapExpressMiddleware(
  expressMiddleware: (
    req: ExpressReq,
    res: ExpressRes,
    next: (err?: any) => void
  ) => void
): Middleware {
  return async (
    ctx: Context,
    bunNext: () => Promise<Response>
  ): Promise<Response> => {
    return new Promise<Response>((resolve, reject) => {
      const fullUrl = new URL(ctx.req.url);
      const baseUrl = "/api-docs"; // Make sure this matches your app.use("/api-docs", ...)
      // Normalize pathRelativeToBase as well, as it's used in expressReq.path and expressReq.url
      let pathRelativeToBase = fullUrl.pathname.startsWith(baseUrl)
        ? fullUrl.pathname.substring(baseUrl.length)
        : fullUrl.pathname;

      if (pathRelativeToBase.length > 1 && pathRelativeToBase.endsWith("/")) {
        pathRelativeToBase = pathRelativeToBase.slice(0, -1);
      }

      const pathWithQueryRelativeToBase = pathRelativeToBase + fullUrl.search;

      const expressReq: ExpressReq = {
        url: pathWithQueryRelativeToBase,
        originalUrl: ctx.req.url,
        baseUrl: baseUrl,
        path: pathRelativeToBase.split("?")[0], // path should be normalized
        method: ctx.req.method,
        headers: { ...ctx.req.headers },
        query: ctx.query,
        params: ctx.params,
        body: ctx.body, // Pass the parsed body from BunServe context
        accepts: ctx.req.headers["accept"] || "*/*",
      };

      const expressRes: ExpressRes = {
        statusCode: ctx.statusCode,
        headers: {}, // Express middleware will set headers here
        _body: null,
        _isEnded: false,
        _bunCtx: ctx, // Store reference to BunServe Context

        status(code: number): ExpressRes {
          this.statusCode = code;
          this._bunCtx.statusCode = code; // Propagate to Bun Context
          return this;
        },
        sendStatus(code: number): ExpressRes {
          this.statusCode = code;
          this._bunCtx.statusCode = code;
          this.end();
          return this;
        },
        json(data: any): ExpressRes {
          this.setHeader("Content-Type", "application/json");
          this.send(JSON.stringify(data));
          return this;
        },
        send(data: any): ExpressRes {
          this._body = data;
          this.end();
          return this;
        },
        setHeader(name: string, value: string): void {
          this.headers[name] = value;
          // IMPORTANT: Do NOT immediately set on ctx.headers here.
          // This is because ctx.send() might be called by the next line,
          // and we want its own default to potentially apply *before*
          // the express middleware explicitly sets content-type.
          // The headers will be merged at the `end()` step.
        },
        end(data?: any): void {
          if (data !== undefined) {
            this._body = data;
          }
          this._isEnded = true;

          // Merge collected ExpressRes headers into BunServe Context's headers
          for (const headerName in this.headers) {
            if (
              this.headers.hasOwnProperty(headerName) &&
              this.headers[headerName] !== undefined
            ) {
              this._bunCtx.headers.set(
                headerName,
                this.headers[headerName] as string
              );
            }
          }

          if (
            this._body !== null ||
            this.statusCode !== this._bunCtx.statusCode ||
            Object.keys(this.headers).length > 0
          ) {
            const finalBody =
              typeof this._body === "string" ||
              this._body instanceof Uint8Array ||
              this._body instanceof ArrayBuffer ||
              this._body instanceof ReadableStream ||
              this._body instanceof FormData ||
              this._body instanceof Blob ||
              this._body === null
                ? this._body
                : String(this._body);

            // Now, create the actual Bun Response using the merged headers from ctx.headers
            const response = new Response(finalBody, {
              status: this.statusCode,
              headers: this._bunCtx.headers, // Use the now updated ctx.headers
            });
            this._bunCtx._response = response;
            resolve(response);
          } else {
            resolve(bunNext());
          }
        },
      };

      const expressNext = (err?: any) => {
        if (err) {
          reject(err);
        } else {
          bunNext().then(resolve).catch(reject);
        }
      };

      try {
        expressMiddleware(expressReq, expressRes, expressNext);

        if (!expressRes._isEnded && !ctx._response) {
          bunNext().then(resolve).catch(reject);
        }
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

    // Normalize prefix: remove trailing slash unless it's just '/'
    if (prefix.length > 1 && prefix.endsWith("/")) {
      prefix = prefix.slice(0, -1);
    }
    // Ensure prefix starts with /
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
        // Here, we check if it's an Express-style middleware (3 arguments)
        // or a BunServe middleware (2 arguments).
        // This is a heuristic and might need more robust checking for complex cases.
        if (arg.length === 3) {
          handlers.push(wrapExpressMiddleware(arg as any));
        } else {
          handlers.push(arg as Middleware); // Assume it's a BunServe middleware
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
    // Normalize the path for routeMiddlewares storage and router.add
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

    // Normalize the URL's pathname for consistent routing and middleware matching
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    const requestPath = url.pathname; // This is now the normalized path

    let parsedBody: any;
    try {
      const contentType = bunRequest.headers.get("content-type");
      if (
        bunRequest.body &&
        bunRequest.method !== "GET" &&
        bunRequest.method !== "HEAD"
      ) {
        if (contentType?.includes("application/json")) {
          parsedBody = await bunRequest.json();
        } else if (contentType?.includes("application/x-www-form-urlencoded")) {
          const formData = await bunRequest.text();
          parsedBody = Object.fromEntries(new URLSearchParams(formData));
        } else if (contentType?.includes("multipart/form-data")) {
          parsedBody = await bunRequest.formData();
        } else if (contentType?.includes("text/plain")) {
          parsedBody = await bunRequest.text();
        }
        // Add more body parsing types (e.g., ArrayBuffer, Blob) as needed
      }
    } catch (error: any) {
      console.error("Error parsing request body:", error);
      return new Response(
        `Bad Request: Invalid body format. ${error.message}`,
        { status: 400 }
      );
    }

    // Only serve files from /public route
    if (requestPath.startsWith("/public")) {
      // Use normalized path
      // Strip /public from the path and resolve the file path
      const filePath = `.${url.pathname}`; // url.pathname is already normalized
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
        return new Response("Error reading file", { status: 500 });
      }
    }

    const { handler, params } = this.router.find(method, url); // url.pathname is normalized

    const query = Object.fromEntries(url.searchParams.entries());

    const ctx: Context = {
      req: {
        // Construct ExpressReq from Bun's Request and parsed data
        url: bunRequest.url,
        originalUrl: bunRequest.url,
        baseUrl: "", // This might need more logic for nested routers
        path: url.pathname.split("?")[0], // Normalized path
        method: bunRequest.method,
        headers: Object.fromEntries(bunRequest.headers.entries()),
        query: query,
        params: params,
        body: parsedBody, // Assign the parsed body here
        accepts: bunRequest.headers.get("accept") || "*/*",
      },
      params,
      query,
      body: parsedBody, // Assign the parsed body to ctx.body
      file(filePath, options) {
        return new Response(Bun.file(filePath));
      },
      locals: {},
      statusCode: 200,
      headers: new Headers(),
      headersSent() {
        return !!this._response;
      },

      status(code: number): Context {
        this.statusCode = code;
        return this;
      },
      send(
        data:
          | string
          | Uint8Array
          | ArrayBuffer
          | ReadableStream
          | FormData
          | Blob
          | null
      ): Response {
        if (!this.headers.has("Content-Type")) {
          if (typeof data === "string" && data.trim().startsWith("<")) {
            this.headers.set("Content-Type", "text/html; charset=utf-8");
          } else {
            this.headers.set("Content-Type", "text/html; charset=utf-8"); // Default to text/html for string data
          }
        }
        this._response = new Response(data, {
          status: this.statusCode,
          headers: this.headers,
        });
        return this._response;
      },
      json(data: object | Array<any>): Response {
        this.headers.set("Content-Type", "application/json");
        this._response = new Response(JSON.stringify(data), {
          status: this.statusCode,
          headers: this.headers,
        });
        return this._response;
      },
      set(name: string, value: string): Context {
        this.headers.set(name, value);
        return this;
      },
      setHeader(name: string, value: string): Context {
        return this.set(name, value);
      },
    };

    const allApplicableMiddlewares: Middleware[] = [];

    this.globalMiddlewares.forEach((mw) => {
      // Use the normalized requestPath for middleware prefix matching
      if (requestPath.startsWith(mw.prefix)) {
        allApplicableMiddlewares.push(mw.middleware);
      }
    });

    if (handler) {
      // Use the normalized requestPath to retrieve route-specific middlewares
      const routeSpecificMWs = this.routeMiddlewares
        .get(requestPath)
        ?.get(method.toUpperCase());
      if (routeSpecificMWs) {
        allApplicableMiddlewares.push(...routeSpecificMWs);
      }
    }

    let middlewareIndex = 0;

    const next = async (): Promise<Response> => {
      if (ctx._response) {
        return ctx._response;
      }

      if (middlewareIndex < allApplicableMiddlewares.length) {
        const currentMiddleware = allApplicableMiddlewares[middlewareIndex++];
        const response = await currentMiddleware(ctx, next);
        return response || ctx._response || new Response("", { status: 404 });
      } else {
        if (handler) {
          try {
            const result = await handler(ctx);
            return result instanceof Response
              ? result
              : ctx._response || new Response("", { status: 404 });
          } catch (error: any) {
            console.error("Route handler error:", error);
            return new Response(`Internal Server Error: ${error.message}`, {
              status: 500,
            });
          }
        } else {
          return ctx._response || new Response("Not Found", { status: 404 });
        }
      }
    };

    try {
      return await next();
    } catch (error: any) {
      console.error("Middleware chain error:", error);
      return new Response(`Internal Server Error: ${error.message}`, {
        status: 500,
      });
    }
  }

  listen(callback?: () => void) {
    Bun.serve({
      port: this.port,
      hostname: this.hostname,
      fetch: this.handleRequest.bind(this) as any, // Bun's fetch receives a Request object
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
