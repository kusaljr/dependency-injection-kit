import { BadRequestException } from "@express-di-kit/common";
import { processBodyAndValidate } from "@express-di-kit/utils/validate";
import http from "http";
import WebSocket from "ws";
import { ZodError } from "zod";
import {
  getSocketMetadata,
  SOCKET_PARAM_METADATA_KEY,
  SocketParamType,
} from "./decorator";

export class WebSocketServer {
  private server = http.createServer();
  private wss = new WebSocket.Server({ server: this.server });
  private handlers: any[] = [];

  constructor(private port: number) {}

  registerHandler(handlerInstance: any) {
    const meta = getSocketMetadata(handlerInstance.constructor);
    this.handlers.push({ instance: handlerInstance, ...meta });
  }

  start() {
    this.wss.on("connection", (ws) => {
      console.log("🟢 Client connected");

      ws.on("message", async (msg: string) => {
        try {
          const { event, data } = JSON.parse(msg);

          // ✅ Log incoming data
          console.log("📩 Incoming message:");
          console.log("   Event:", event);
          console.log("   Data:", data);

          for (const handler of this.handlers) {
            for (const evt of handler.events) {
              if (evt.event !== event) continue;

              const method = handler.instance[evt.method];
              if (typeof method !== "function") continue;

              console.log(
                `⚙️ Executing handler: ${handler.instance.constructor.name}.${evt.method}`
              );

              // 🧩 Get parameter metadata
              const paramDefs =
                Reflect.getMetadata(
                  SOCKET_PARAM_METADATA_KEY,
                  handler.instance,
                  evt.method
                ) || [];

              const args: any[] = [];

              for (const param of paramDefs) {
                switch (param.type) {
                  case SocketParamType.CLIENT:
                    args[param.index] = ws;
                    break;
                  case SocketParamType.DATA:
                    try {
                      const validatedData = await processBodyAndValidate(
                        { data },
                        param.dtoClass
                      );
                      args[param.index] = validatedData;
                    } catch (err) {
                      if (err instanceof ZodError) {
                        console.error("❌ Validation failed:", err.errors);
                        ws.send(
                          JSON.stringify({
                            event: "error",
                            data: {
                              message: "Validation failed",
                              errors: err.errors,
                            },
                          })
                        );
                        return;
                      }
                      if (err instanceof BadRequestException) {
                        console.error("❌ Bad request:", err.message);
                        ws.send(
                          JSON.stringify({
                            event: "error",
                            data: { message: err.message },
                          })
                        );
                        return;
                      }
                      console.error("❌ Unknown validation error:", err);
                      return;
                    }
                    break;
                }
              }

              // ✅ Call the handler with resolved args
              await method.apply(handler.instance, args);
            }
          }
        } catch (err) {
          console.error("❌ Error parsing message:", err);
          console.error("   Raw message:", msg);
          ws.send(
            JSON.stringify({
              event: "error",
              data: { message: "Invalid message format" },
            })
          );
        }
      });
    });

    this.server.listen(this.port, () => {
      console.log(`🚀 WebSocket server listening on port ${this.port}`);
    });
  }
}
