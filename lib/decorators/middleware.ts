import { NextFunction, Request, Response } from "express";
import "reflect-metadata";

export type InterceptorFunction = (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

export function createDecorator(interceptor: InterceptorFunction) {
  return function (target: any, propertyKey?: string | symbol) {
    if (propertyKey) {
      // Method-level
      const existing =
        Reflect.getMetadata("methodMiddlewares", target, propertyKey) || [];
      Reflect.defineMetadata(
        "methodMiddlewares",
        [...existing, interceptor],
        target,
        propertyKey
      );
    } else {
      // Class-level
      const existing =
        Reflect.getMetadata("controllerInterceptors", target) || [];
      Reflect.defineMetadata(
        "controllerInterceptors",
        [...existing, interceptor],
        target
      );
    }
  };
}

export function UseGuard(interceptor: InterceptorFunction) {
  return createDecorator(interceptor);
}
