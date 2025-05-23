export const SOCKET_EVENTS_KEY = Symbol("socket:events");
export const SOCKET_METADATA_KEY = Symbol("socket:metadata");

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
