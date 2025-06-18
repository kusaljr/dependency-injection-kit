import "reflect-metadata";

export enum HttpMethod {
  GET = "get",
  POST = "post",
  PUT = "put",
  DELETE = "delete",
  PATCH = "patch",
}

export interface RouteDefinition {
  summary?: string;
  description?: any;
  tags?: string[];
  parameters?: any;
  requestBody?: any;
  responses?: { "200": { description: string } };
  path: string;
  method: HttpMethod;
  handlerName: string | symbol;
}

export function Controller(prefix: string = "/"): ClassDecorator {
  return (target: Function) => {
    Reflect.defineMetadata("prefix", prefix, target);

    Reflect.defineMetadata("injectable", true, target);
  };
}

function createMethodDecorator(method: HttpMethod) {
  return (path: string = "/"): MethodDecorator => {
    return (target: Object, propertyKey: string | symbol) => {
      const routes: RouteDefinition[] =
        Reflect.getMetadata("routes", target.constructor) || [];

      routes.push({
        path,
        method,
        handlerName: propertyKey,
      });
      Reflect.defineMetadata("routes", routes, target.constructor);
    };
  };
}

export const Get = createMethodDecorator(HttpMethod.GET);
export const Post = createMethodDecorator(HttpMethod.POST);
export const Put = createMethodDecorator(HttpMethod.PUT);
export const Delete = createMethodDecorator(HttpMethod.DELETE);
export const Patch = createMethodDecorator(HttpMethod.PATCH);

export enum ParameterType {
  PARAM = "param",
  QUERY = "query",
  REQ = "req",
  RES = "res",
  NEXT = "next",
  BODY = "body",
}

export interface ParameterDefinition {
  index: number;
  name?: string;
  type: ParameterType;
  schemaType?: any;
}

function createParameterDecorator(type: ParameterType) {
  return (name?: string): ParameterDecorator => {
    return (target, propertyKey, parameterIndex) => {
      const existingParameters: ParameterDefinition[] =
        Reflect.getMetadata("parameters", target, propertyKey as string) || [];

      existingParameters.push({
        index: parameterIndex,
        name,
        type,
      });

      Reflect.defineMetadata(
        "parameters",
        existingParameters,
        target,
        propertyKey as string
      );
    };
  };
}

export const Param = createParameterDecorator(ParameterType.PARAM);
export const Query = createParameterDecorator(ParameterType.QUERY);

export const Body = (): ParameterDecorator => {
  return (target, propertyKey, parameterIndex) => {
    const existingParameters: ParameterDefinition[] =
      Reflect.getMetadata("parameters", target, propertyKey as string) || [];

    const paramTypes = Reflect.getMetadata(
      "design:paramtypes",
      target,
      propertyKey as string | symbol
    );
    const bodyType = paramTypes?.[parameterIndex];

    existingParameters.push({
      index: parameterIndex,
      type: ParameterType.BODY,
      schemaType: bodyType,
    });

    Reflect.defineMetadata(
      "parameters",
      existingParameters,
      target,
      propertyKey as string
    );
  };
};

// Req & Res (do not require a name)
export const Req = createParameterDecorator(ParameterType.REQ)();
export const Res = createParameterDecorator(ParameterType.RES)();
export const Next = createParameterDecorator(ParameterType.NEXT)();

export function ApiBearerAuth(name = "bearerAuth"): MethodDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(
      "security",
      [{ [name]: [] }],
      target,
      propertyKey as string
    );
  };
}

export function Property(): PropertyDecorator {
  return (target, key) => {
    const type = Reflect.getMetadata("design:type", target, key);
    const properties =
      Reflect.getMetadata("dto:properties", target.constructor) || {};
    properties[key] = type;
    Reflect.defineMetadata("dto:properties", properties, target.constructor);
  };
}
