export interface DikitInterceptor {
  intercept(target: Function, context: any, args: any[]): any;
}

export function UseInterceptor(
  interceptorClass: new () => DikitInterceptor
): ClassDecorator & MethodDecorator {
  return (
    target: any,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor
  ) => {
    if (descriptor) {
      const originalMethod = descriptor.value;
      descriptor.value = function (...args: any[]) {
        const interceptor = new interceptorClass();
        return interceptor.intercept(originalMethod, this, args);
      };
    } else {
      for (const key of Object.getOwnPropertyNames(target.prototype)) {
        if (key === "constructor") continue;
        const method = target.prototype[key];
        if (typeof method === "function") {
          target.prototype[key] = function (...args: any[]) {
            const interceptor = new interceptorClass();
            return interceptor.intercept(method, this, args);
          };
        }
      }
    }
  };
}
