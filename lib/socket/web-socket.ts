// ws-server.ts
import http from "http";
import WebSocket from "ws";
import { getSocketMetadata } from "./decorator";

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
      console.log("Client connected");

      ws.on("message", (msg: string) => {
        try {
          const { event, data } = JSON.parse(msg);
          for (const handler of this.handlers) {
            for (const evt of handler.events) {
              if (evt.event === event) {
                handler.instance[evt.method](ws, data);
              }
            }
          }
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      });
    });

    this.server.listen(this.port, () => {
      console.log(`WebSocket server listening on port ${this.port}`);
    });
  }
}
