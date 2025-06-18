import "reflect-metadata";
import { Constructor } from "./container";

export interface ExecutionContext {
  getType(): "http" | "ws" | "rpc";
  switchToHttp(): {
    getRequest(): any;
    getResponse(): any;
  };
  getHandler(): Function;
  getClass<T = any>(): Constructor<T>;
}

export interface CallHandler {
  handle(): Promise<any>;
}

export interface DiKitInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Promise<any> | any;
}

export const INTERCEPTOR_METADATA = "interceptors";

export function UseInterceptors(
  ...interceptors: Constructor<DiKitInterceptor>[]
) {
  return function (
    target: any,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor
  ) {
    if (propertyKey && descriptor) {
      const existingInterceptors: Constructor<DiKitInterceptor>[] =
        Reflect.getMetadata(INTERCEPTOR_METADATA, target, propertyKey) || [];
      Reflect.defineMetadata(
        INTERCEPTOR_METADATA,
        [...existingInterceptors, ...interceptors],
        target,
        propertyKey
      );
    } else {
      const existingInterceptors: Constructor<DiKitInterceptor>[] =
        Reflect.getMetadata(INTERCEPTOR_METADATA, target) || [];
      Reflect.defineMetadata(
        INTERCEPTOR_METADATA,
        [...existingInterceptors, ...interceptors],
        target
      );
    }
  };
}
