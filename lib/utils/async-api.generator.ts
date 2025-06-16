import "reflect-metadata";
import { SOCKET_EVENTS_KEY, SOCKET_METADATA_KEY } from "../socket/decorator";

interface AsyncAPIOptions {
  title: string;
  version?: string;
  description?: string;
  serverUrl?: string;
  serverDescription?: string;
}

interface SocketEventDefinition {
  event: string;
  method: string;
  description?: string;
  parameters?: any;
  response?: any;
  summary?: string;
}

interface SocketControllerMetadata {
  namespace: string;
  events: SocketEventDefinition[];
  description?: string;
}

// Schema generation helper
function generateSchemaFromClass(cls: Function): any {
  if (!cls) return { type: "object" };

  const props: { [key: string]: Function } =
    Reflect.getMetadata("dto:properties", cls) || {};
  const schemaProps: Record<string, any> = {};

  for (const [key, typeFn] of Object.entries(props)) {
    const type = typeFn.name.toLowerCase();
    schemaProps[key] = {
      type:
        type === "string" || type === "number" || type === "boolean"
          ? type
          : "object",
    };
  }

  return {
    type: "object",
    properties: schemaProps,
    required: Object.keys(schemaProps),
  };
}

// Generate AsyncAPI document
export function generateAsyncAPIDoc(
  socketControllers: Function[],
  options: AsyncAPIOptions
): any {
  const channels: { [channel: string]: any } = {};

  for (const controller of socketControllers) {
    const namespace: string =
      Reflect.getMetadata("socket:namespace", controller) || "/";
    const description: string =
      Reflect.getMetadata("socket:description", controller) || "";
    const events: SocketEventDefinition[] =
      Reflect.getMetadata(SOCKET_EVENTS_KEY, controller) || [];

    for (const event of events) {
      const channelName =
        namespace === "/" ? `/${event.event}` : `${namespace}/${event.event}`;

      if (!channels[channelName]) {
        channels[channelName] = {};
      }

      // Determine if this is a subscribe (incoming) or publish (outgoing) event
      const isPublish = (event as any).type === "publish";
      const operationType = isPublish ? "publish" : "subscribe";

      const messageSchema = event.parameters
        ? typeof event.parameters === "function"
          ? generateSchemaFromClass(event.parameters)
          : event.parameters
        : { type: "object" };

      channels[channelName][operationType] = {
        summary:
          event.summary ||
          `${isPublish ? "Emit" : "Handle"} ${event.event} event`,
        description:
          event.description ||
          `${isPublish ? "Emits" : "Handles"} the ${event.event} event`,
        message: {
          name: event.event,
          title: event.event,
          summary: event.summary,
          description: event.description,
          payload: messageSchema,
          examples: [
            {
              name: `${event.event}Example`,
              summary: `Example ${event.event} message`,
              payload: generateExampleFromSchema(messageSchema),
            },
          ],
        },
        tags: [
          {
            name: controller.name
              .replace(/Controller$/, "")
              .replace(/Socket$/, ""),
            description: description,
          },
        ],
      };

      // Add response if specified
      if (event.response && !isPublish) {
        const responseSchema =
          typeof event.response === "function"
            ? generateSchemaFromClass(event.response)
            : event.response;

        const responseChannelName = `${channelName}/response`;
        channels[responseChannelName] = {
          publish: {
            summary: `Response to ${event.event}`,
            description: `Response message for ${event.event} event`,
            message: {
              name: `${event.event}Response`,
              title: `${event.event} Response`,
              payload: responseSchema,
              examples: [
                {
                  name: `${event.event}ResponseExample`,
                  payload: generateExampleFromSchema(responseSchema),
                },
              ],
            },
          },
        };
      }
    }
  }

  return {
    asyncapi: "2.6.0",
    info: {
      title: options.title,
      version: options.version,
      description: options.description || "WebSocket API Documentation",
    },
    servers: {
      production: {
        url: options.serverUrl || "ws://localhost:3000",
        protocol: "ws",
        description: options.serverDescription || "WebSocket server",
      },
    },
    channels,
    components: {
      messages: {},
      schemas: {},
    },
  };
}

// Helper to generate example data from schema
function generateExampleFromSchema(schema: any): any {
  if (!schema || !schema.properties) {
    return {};
  }

  const example: any = {};
  for (const [key, prop] of Object.entries(schema.properties as any)) {
    const propSchema = prop as any;
    switch (propSchema.type) {
      case "string":
        example[key] = `example_${key}`;
        break;
      case "number":
        example[key] = 123;
        break;
      case "boolean":
        example[key] = true;
        break;
      case "array":
        example[key] = [];
        break;
      default:
        example[key] = {};
    }
  }
  return example;
}

// Collect socket controllers (similar to REST controllers)
export async function collectSocketControllersForAsyncAPI(
  controllersDir: string
): Promise<Function[]> {
  const socketControllerClasses: Function[] = [];
  const files = findSocketControllerFiles(controllersDir);

  for (const filePath of files) {
    if (
      !filePath.endsWith(".socket.ts") &&
      !filePath.endsWith(".socket.js") &&
      !filePath.endsWith(".gateway.ts") &&
      !filePath.endsWith(".gateway.js")
    ) {
      continue;
    }

    const module = require(filePath);
    for (const key of Object.keys(module)) {
      const SocketControllerClass = module[key];
      const hasSocketMetadata = Reflect.getMetadata(
        SOCKET_METADATA_KEY,
        SocketControllerClass
      );
      if (hasSocketMetadata) {
        socketControllerClasses.push(SocketControllerClass);
      }
    }
  }
  return socketControllerClasses;
}

// Helper to find socket controller files
function findSocketControllerFiles(dir: string): string[] {
  const fs = require("fs");
  const path = require("path");
  const files: string[] = [];

  function traverse(currentDir: string) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (
        item.endsWith(".socket.ts") ||
        item.endsWith(".socket.js") ||
        item.endsWith(".gateway.ts") ||
        item.endsWith(".gateway.js")
      ) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

// Get socket metadata (enhanced version)
export function getSocketMetadata(
  constructor: Function
): SocketControllerMetadata {
  return {
    namespace: Reflect.getMetadata("socket:namespace", constructor) || "/",
    events: Reflect.getMetadata(SOCKET_EVENTS_KEY, constructor) || [],
    description: Reflect.getMetadata("socket:description", constructor),
  };
}
