import { NextFunction, Request, Response } from "express";

export interface ExpressMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
}
