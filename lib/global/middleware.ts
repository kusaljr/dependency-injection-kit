import { NextFunction, Request, Response } from "express";

export interface ExpressMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
}

// Store metadata for interceptors
export interface InterceptorDefinition {
  interceptor: ExpressMiddleware;
  order?: number; // If you need to define an order for multiple interceptors
}
