export interface CanActivate {
  canActivate(req: Request, res: Response): boolean | Promise<boolean>;
}

export function UseGuards(
  ...guards: (new () => CanActivate)[]
): ClassDecorator & MethodDecorator {
  return function (target: any, propertyKey?: string | symbol) {
    if (propertyKey) {
      const existing =
        Reflect.getMetadata("methodGuards", target, propertyKey) || [];
      Reflect.defineMetadata(
        "methodGuards",
        [...existing, ...guards],
        target,
        propertyKey
      );
    } else {
      const existing = Reflect.getMetadata("classGuards", target) || [];
      Reflect.defineMetadata("classGuards", [...existing, ...guards], target);
    }
  };
}

export function guardMiddlewareFactory(controller: any, propertyKey: string) {
  return async (req: any, res: any, next: any) => {
    const classGuards: (new () => CanActivate)[] =
      Reflect.getMetadata("classGuards", controller.constructor) || [];
    const methodGuards: (new () => CanActivate)[] =
      Reflect.getMetadata("methodGuards", controller, propertyKey) || [];

    const allGuards = [...classGuards, ...methodGuards];

    for (const Guard of allGuards) {
      const instance = new Guard();
      const canActivate = await instance.canActivate(req, res);
      if (!canActivate) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Access denied by guard.",
        });
      }
    }

    next();
  };
}

export async function evaluateGuards(
  guards: CanActivate[],
  req: any,
  res: any
): Promise<boolean> {
  for (const guardInstance of guards) {
    const result = await guardInstance.canActivate(req, res);
    if (!result) return false;
  }
  return true;
}
