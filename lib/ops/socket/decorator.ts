import "reflect-metadata";

const SOCKET_EVENTS_KEY = Symbol("socket:events");

export function Socket(config?: { namespace?: string }) {
  return function (constructor: Function) {
    Reflect.defineMetadata("socket:metadata", true, constructor); // <-- Add this
    Reflect.defineMetadata(
      "socket:namespace",
      config?.namespace || "/",
      constructor
    );
  };
}

export function Subscribe(config: { event: string }) {
  return function (target: any, propertyKey: string) {
    const events =
      Reflect.getMetadata(SOCKET_EVENTS_KEY, target.constructor) || [];
    events.push({ event: config.event, method: propertyKey });
    Reflect.defineMetadata(SOCKET_EVENTS_KEY, events, target.constructor);
  };
}

export function getSocketMetadata(constructor: Function) {
  return {
    namespace: Reflect.getMetadata("socket:namespace", constructor),
    events: Reflect.getMetadata(SOCKET_EVENTS_KEY, constructor) || [],
  };
}
