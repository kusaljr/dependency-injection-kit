import { NextFunction, Request, Response } from "express";

export const MyControllerInterceptor = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("Controller Interceptor: Request received for MyController");
  next();
};
