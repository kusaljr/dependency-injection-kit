import "reflect-metadata";

export const SOCKET_EVENTS_KEY = Symbol("socket:events");
export const SOCKET_METADATA_KEY = Symbol("socket:metadata");

import "reflect-metadata";

export const SOCKET_PARAM_METADATA_KEY = Symbol("socket:param");

export enum SocketParamType {
  CLIENT = "client",
  DATA = "data",
}

export interface SocketParameterDefinition {
  index: number;
  type: SocketParamType;
  dtoClass?: any;
}

export function Data() {
  return function (target: any, propertyKey: string, parameterIndex: number) {
    const existingParams: SocketParameterDefinition[] =
      Reflect.getMetadata(SOCKET_PARAM_METADATA_KEY, target, propertyKey) || [];

    // Get the parameter type using Reflect metadata
    const paramTypes = Reflect.getMetadata(
      "design:paramtypes",
      target,
      propertyKey
    );

    const dtoClass = paramTypes?.[parameterIndex];

    existingParams.push({
      index: parameterIndex,
      type: SocketParamType.DATA,
      dtoClass,
    });

    Reflect.defineMetadata(
      SOCKET_PARAM_METADATA_KEY,
      existingParams,
      target,
      propertyKey
    );
  };
}

export function Client() {
  return function (target: any, propertyKey: string, parameterIndex: number) {
    const existingParams: SocketParameterDefinition[] =
      Reflect.getMetadata(SOCKET_PARAM_METADATA_KEY, target, propertyKey) || [];

    existingParams.push({
      index: parameterIndex,
      type: SocketParamType.CLIENT,
    });

    Reflect.defineMetadata(
      SOCKET_PARAM_METADATA_KEY,
      existingParams,
      target,
      propertyKey
    );
  };
}

export function Socket(config?: { namespace?: string; description?: string }) {
  return function (constructor: Function) {
    Reflect.defineMetadata(SOCKET_METADATA_KEY, true, constructor);
    Reflect.defineMetadata(
      "socket:namespace",
      config?.namespace || "/",
      constructor
    );
    if (config?.description) {
      Reflect.defineMetadata(
        "socket:description",
        config.description,
        constructor
      );
    }
  };
}

export function Subscribe(config: {
  event: string;
  description?: string;
  summary?: string;
  parameters?: any;
  response?: any;
}) {
  return function (target: any, propertyKey: string) {
    const events =
      Reflect.getMetadata(SOCKET_EVENTS_KEY, target.constructor) || [];
    events.push({
      event: config.event,
      method: propertyKey,
      description: config.description,
      summary: config.summary,
      parameters: config.parameters,
      response: config.response,
    });
    Reflect.defineMetadata(SOCKET_EVENTS_KEY, events, target.constructor);
  };
}

export function Emit(config: {
  event: string;
  description?: string;
  summary?: string;
  parameters?: any;
}) {
  return function (target: any, propertyKey: string) {
    const events =
      Reflect.getMetadata(SOCKET_EVENTS_KEY, target.constructor) || [];
    events.push({
      event: config.event,
      method: propertyKey,
      description: config.description,
      summary: config.summary,
      parameters: config.parameters,
      type: "publish", // Mark as publish event
    });
    Reflect.defineMetadata(SOCKET_EVENTS_KEY, events, target.constructor);
  };
}

export function getSocketMetadata(constructor: Function) {
  return {
    namespace: Reflect.getMetadata("socket:namespace", constructor) || "/",
    events: Reflect.getMetadata(SOCKET_EVENTS_KEY, constructor) || [],
    description: Reflect.getMetadata("socket:description", constructor),
  };
}
