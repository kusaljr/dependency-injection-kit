import { type Server } from "bun";

type RequestMethodType =
  | "GET"
  | "PUT"
  | "POST"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";
interface Handler {
  (req: any, res: BunResponse): void | Promise<void>;
}
type Middleware = Handler[];
interface Route {
  handler: Handler;
  middlewareFuncs?: Middleware;
}
class TrieTree {
  private root: Node;
  constructor() {
    this.root = new Node();
  }

  get(path: string): {
    routeParams: { [key: string]: string };
    node: Node | null;
  } {
    const paths = path.split("/");
    const node = this.root;
    const params = {};
    return {
      routeParams: params,
      node: this.dig(node, paths, params),
    };
  }

  insert(path: string, value: Route) {
    if (path === "*") {
      path = "/";
    }
    const paths = path.split("/");
    let node = this.root;
    let index = 0;

    while (index < paths.length) {
      const children = node.getChildren();
      const currentPath = paths[index];
      let target = children.find((e) => e.getPath() === currentPath);

      if (!target) {
        target = new Node(currentPath);
        children.push(target);
      }

      node = target;
      index++;
    }

    node.insertChild(value);
  }

  dig(
    node: Node,
    paths: string[],
    params: { [key: string]: string }
  ): Node | null {
    if (paths.length === 0) {
      return node;
    }

    const target = node
      .getChildren()
      .filter((e) => e.getPath() === paths[0] || e.getPath().includes(":"));

    if (target.length === 0) {
      return null;
    }

    let next = null;

    for (let i = 0; i < target.length; ++i) {
      const e = target[i];
      if (e && e.getPath().startsWith(":")) {
        const key = e.getPath().replace(":", "");
        // params[key] = paths[0];
        const path = paths[0];
        if (!path) {
          return null;
        }
        params[key] = path;
      }

      paths.shift();
      if (e) {
        next = this.dig(e, paths, params);
        if (next) {
          return next;
        }
      }
    }

    return next;
  }
}

class Node {
  private path: string;
  private handlers?: Route;
  private children: Node[];

  constructor(path: string = "") {
    this.path = path;
    this.handlers = undefined;
    this.children = [];
  }

  insertChild(handlers: Route) {
    this.handlers = handlers;
  }

  getChildren() {
    return this.children;
  }

  getHandler() {
    return this.handlers?.handler;
  }

  getMiddlewares() {
    return this.handlers?.middlewareFuncs || [];
  }

  getPath() {
    return this.path;
  }
}

class BunResponse {
  public response: Response | undefined;
  private options: ResponseInit = {};

  status(code: number): BunResponse {
    this.options = { ...this.options, status: code };
    return this;
  }

  statusText(text: string): BunResponse {
    this.options = { ...this.options, statusText: text };
    return this;
  }

  json(body: any): void {
    this.response = Response.json(body, this.options);
  }

  getResponse(): Response {
    if (!this.response) {
      throw new Error("Response is not set. Use json() or send() first.");
    }
    return this.response;
  }
  send(body: string | Record<string, any>): void {
    if (typeof body === "string") {
      this.response = new Response(body, this.options);
    } else {
      this.response = Response.json(body, this.options);
    }
  }
}

export class BunServer {
  private static server?: BunServer;
  private requestMap: { [method: string]: TrieTree } = {};

  constructor() {
    if (BunServer.server) {
      throw new Error(
        "DONT use this constructor to create bun server, try Server()"
      );
    }
    BunServer.server = this;
  }

  get(path: string, ...handlers: Handler[]) {
    this.delegate(path, "GET", handlers);
  }

  put(path: string, ...handlers: Handler[]) {
    this.delegate(path, "PUT", handlers);
  }

  post(path: string, ...handlers: Handler[]) {
    this.delegate(path, "POST", handlers);
  }

  patch(path: string, ...handlers: Handler[]) {
    this.delegate(path, "PATCH", handlers);
  }

  delete(path: string, ...handlers: Handler[]) {
    this.delegate(path, "DELETE", handlers);
  }

  options(path: string, ...handlers: Handler[]) {
    this.delegate(path, "OPTIONS", handlers);
  }

  head(path: string, ...handlers: Handler[]) {
    this.delegate(path, "HEAD", handlers);
  }

  private submitToMap(
    method: RequestMethodType,
    path: string,
    handler: Handler,
    middlewares: Middleware
  ) {
    let targetTree = this.requestMap[method];
    if (!targetTree) {
      this.requestMap[method] = new TrieTree();
      targetTree = this.requestMap[method];
    }
    const route = {
      handler: handler,
      middlewareFuncs: middlewares,
    };
    targetTree.insert(path, route);
  }

  private delegate(
    path: string,
    method: RequestMethodType,
    handlers: Handler[]
  ) {
    let key = path;
    if (key === "/") {
      key = "";
    }
    if (handlers.length < 1) return;

    const middlewares = handlers.slice(0, -1);
    const handler = handlers[handlers.length - 1];

    if (!handler) {
      throw new Error(`No handler provided for ${method} ${path}`);
    }

    this.submitToMap(method, path, handler, middlewares);
  }

  listen(port: number) {
    console.log(`Bun server is listening on port ${port}`);
    return this.openServer(port);
  }

  private async bunRequest(req: Request) {
    const { searchParams, pathname } = new URL(req.url);
    console.log(`Received request: ${req.method} ${pathname}`);
    const newRequest = {
      method: req.method,
      path: pathname,
      body: null as unknown,
      query: {} as { [key: string]: string },
      originalUrl: req.url,
      params: {} as { [key: string]: string },
      headers: {} as { [key: string]: string | string[] },
    };

    searchParams.forEach((value, key) => {
      newRequest.query[key] = value;
    });

    const bodyStr = await req.text();

    try {
      newRequest.body = JSON.parse(bodyStr);
    } catch (err) {
      newRequest.body = bodyStr;
    }

    req.headers.forEach((value, key) => {
      newRequest.headers = newRequest.headers || {};
      newRequest.headers[key] = value;
    });

    return newRequest;
  }

  private responseProxy() {
    const response = new BunResponse();
    return new Proxy(response, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (
          typeof value === "function" &&
          (prop === "json" || prop === "send")
        ) {
          if (target.response) {
            throw new Error("You cannot send response twice");
          }
          return (...args: any[]) => {
            value.apply(target, args);
            return target.response;
          };
        } else {
          return value;
        }
      },
    });
  }

  private openServer(port: number) {
    const that = this;
    Bun.serve({
      port,
      reusePort: true,
      async fetch(request, server: Server) {
        console.log(`Handling request: ${request.method} ${request.url}`);
        const req = await that.bunRequest(request);

        const res = that.responseProxy();

        if (req.path.endsWith("/")) {
          req.path = req.path.slice(0, req.path.length);
        }

        const tree = that.requestMap[req.method];
        if (!tree) {
          //   throw new Error(`No route found for method ${req.method}`);
          console.error(`No route found for method ${req.method}`);
          res.status(404).send("Not Found");
          return res.getResponse();
        }

        const leaf = tree.get(req.path);

        if (!leaf.node) {
          console.error(`Cannot ${req.method} ${req.path}`);
          res.status(404).send("Not Found");
          return res.getResponse();
        }

        const handler = leaf.node.getHandler();
        if (handler) {
          req.params = leaf.routeParams;
          await handler(req, res);
          return res.getResponse();
        }
        console.error(`No handler found for ${req.method} ${req.path}`);
        res.status(404).send("Not Found");
        return res.getResponse();
      },
      error(error) {
        console.error("Error occurred:", error);
        return new Response("Internal Server Error", {
          status: 500,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      },
    });
  }
}

// const server = new BunServer();
// server.get("/", (req, res) => {
//   res.json({ message: "Hello, World!" });
// });
// server.listen(3000);
