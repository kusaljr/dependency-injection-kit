import "reflect-metadata";

export type Constructor<T = any> = new (...args: any[]) => T;

export class Container {
  private static instance: Container;
  private instances = new Map<Constructor, object>();
  private registrations = new Map<Constructor, Constructor>();

  private constructor() {}

  public static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  public register<T>(token: Constructor<T>): void {
    if (this.registrations.has(token)) {
      throw new Error(`Token already registered.`);
    }
    this.registrations.set(token, token);
  }

  private resolving = new Set<Constructor>();

  public resolve<T>(token: Constructor<T>): T {
    if (this.resolving.has(token)) {
      throw new Error(`Cyclic dependency detected for token: ${token.name}`);
    }

    this.resolving.add(token);
    try {
      if (this.instances.has(token)) {
        return this.instances.get(token) as T;
      }

      const target = this.registrations.get(token);
      if (!target) {
        throw new Error(`No registration for token: ${token.name}`);
      }

      const paramTypes: Constructor[] =
        Reflect.getMetadata("design:paramtypes", target) || [];

      const dependencies = paramTypes.map((paramType) =>
        this.resolve(paramType)
      );

      const instance = new target(...dependencies);
      this.instances.set(token, instance);
      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }
}
