export interface Context {
  req: Request;
  _response?: Response;
  params: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  locals: Record<string, any>;

  statusCode: number;
  headers: Headers;

  status(code: number): Context;
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

// --- NEW: Shim for Express-style middleware ---
type ExpressReq = {
  url?: string;
  originalUrl?: string;
  baseUrl?: string; // Important for nested routers/middleware
  path?: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string>;
  params: Record<string, string>;
  body?: any;
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
      const pathRelativeToBase = fullUrl.pathname.startsWith(baseUrl)
        ? fullUrl.pathname.substring(baseUrl.length)
        : fullUrl.pathname;
      const pathWithQueryRelativeToBase = pathRelativeToBase + fullUrl.search;

      const expressReq: ExpressReq = {
        url: pathWithQueryRelativeToBase,
        originalUrl: ctx.req.url,
        baseUrl: baseUrl,
        path: pathRelativeToBase.split("?")[0],
        method: ctx.req.method,
        headers: Object.fromEntries(ctx.req.headers.entries()),
        query: ctx.query,
        params: ctx.params,
        body: ctx.body,
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

    if (prefix !== "/" && !prefix.startsWith("/")) {
      prefix = "/" + prefix;
    }
    if (prefix.length > 1 && prefix.endsWith("/")) {
      prefix = prefix.slice(0, -1);
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
        handlers.push(wrapExpressMiddleware(arg as any));
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

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method;
    const requestPath = url.pathname;

    const { handler, params } = this.router.find(method, url);

    const query = Object.fromEntries(url.searchParams.entries());

    const ctx: Context = {
      req,
      params,
      query,
      locals: {},
      statusCode: 200,
      headers: new Headers(),

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
        // Only set text/plain if NO Content-Type is set at all.
        // This allows HTML/JSON/other explicit types to pass through.
        if (!this.headers.has("Content-Type")) {
          if (typeof data === "string" && data.trim().startsWith("<")) {
            // Heuristic for HTML
            this.headers.set("Content-Type", "text/html; charset=utf-8");
          } else {
            this.headers.set("Content-Type", "text/html; charset=utf-8");
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
      fetch: this.handleRequest.bind(this),
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
