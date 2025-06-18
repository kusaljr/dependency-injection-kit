import { SeoMeta } from "@express-di-kit/static/decorator";

export type DiKitRequest = {
  url: string;
  originalUrl?: string;
  baseUrl?: string;
  path: string;
  ip: string;
  method: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string>;
  params: Record<string, string>;
  body?: any;
  accepts(types?: string | string[]): string | false;
  acceptsCharsets(charsets?: string | string[]): string | false;
  acceptsEncodings(encodings?: string | string[]): string | false;
  acceptsLanguages(languages?: string | string[]): string | false;
  get(name: string): string | undefined;
  is(type: string): string | false;
  [key: string]: any;
};

export type DiKitResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  _body: any; // Internal buffer for response body
  _isEnded: boolean; // Flag if response has been sent
  _bunCtx: Context; // Reference back to the BunServe Context

  headersSent(): boolean;
  setHeader(name: string, value: string | string[]): void;

  // Response Chainable Methods
  status(code: number): DiKitResponse;
  sendStatus(code: number): DiKitResponse; // Sets status and ends response
  links(links: { [key: string]: string }): DiKitResponse; // Set Link header
  location(url: string): DiKitResponse; // Set Location header
  redirect(url: string, status?: number): DiKitResponse; // Redirects the request
  contentType(type: string): DiKitResponse; // Set Content-Type header
  type(type: string): DiKitResponse; // Alias for contentType
  vary(field: string | string[]): DiKitResponse; // Set Vary header
  append(field: string, value: string | string[]): DiKitResponse; // Append header field

  // Response Sending Methods
  send(
    data:
      | string
      | Uint8Array
      | ArrayBuffer
      | ReadableStream
      | FormData
      | Blob
      | null
      | object
      | number
      | boolean
  ): DiKitResponse;
  json(data: object | Array<any>): DiKitResponse;
  jsonp(data: object | Array<any>): DiKitResponse; // Basic JSONP support
  sendFile(
    filePath: string,
    options?: { root?: string; headers?: Record<string, string> }
  ): Promise<DiKitResponse>;
  download(
    filePath: string,
    filename?: string,
    options?: { root?: string; headers?: Record<string, string> }
  ): Promise<DiKitResponse>;
  render(view: string, options?: object): DiKitResponse; // Placeholder for templating
  end(data?: any): void; // Ends the response process
  // Header Methods
  set(name: string, value: string | string[]): DiKitResponse; // Set header
  header(name: string, value: string | string[]): DiKitResponse; // Alias for set
  get(name: string): string | undefined; // Get response header
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
  ): DiKitResponse;
  clearCookie(name: string, options?: { path?: string }): DiKitResponse;
  // Caching
  etag(val: string | Buffer): DiKitResponse;
  lastModified(date: Date): DiKitResponse;
};

export interface Context {
  req: DiKitRequest;
  res: DiKitResponse;
  _finalBunResponse?: Response;
  params: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  locals: Record<string, any>;
  seoMeta?: SeoMeta;

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
      | object
  ): Response;
  file(
    filePath: string,
    options?: { headers?: Record<string, string> }
  ): Response;
  json(data: object | Array<any>): Response;
  set(name: string, value: string | string[]): Context;
  setHeader(name: string, value: string | string[]): Context;
}
