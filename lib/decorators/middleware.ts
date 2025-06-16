import { NextFunction, Request, Response } from "express";
import "reflect-metadata";

export interface ConfigurableInterceptor<C = any> {
  configure(config: C): void;
}

export type InterceptorFunction = (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

export type InterceptorClass<C = any> = new (
  ...args: any[]
) => ConfigurableInterceptor<C>;

export type InterceptorClassWithConfig<C> = [InterceptorClass<C>, C];

export function UseInterceptor<C>(
  interceptor:
    | InterceptorFunction
    | InterceptorClass<C>
    | InterceptorClassWithConfig<C>
): ClassDecorator & MethodDecorator {
  return function (target: any, propertyKey?: string | symbol) {
    const key = propertyKey ? "methodMiddlewares" : "controllerInterceptors";
    const existing = Reflect.getMetadata(key, target, propertyKey!) || [];
    Reflect.defineMetadata(
      key,
      [...existing, interceptor],
      target,
      propertyKey!
    );
  };
}
