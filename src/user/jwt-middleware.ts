import { useInterceptor } from "@express-di-kit/common";
import { NextFunction, Request, Response } from "express";

export const IsAuthenticated = () =>
  useInterceptor((req: Request, res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, name: "Test User" };
    next();
  });
