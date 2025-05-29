import { NextFunction, Request, Response } from "express";
import { useInterceptor } from "../../lib/decorators/middleware";

export const IsAuthenticated = () =>
  useInterceptor((req: Request, res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, name: "Test User" };
    next();
  });
