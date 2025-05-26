import WebSocket from "ws";
import { Socket, Subscribe } from "../../lib/ops/socket/decorator";

@Socket({ namespace: "/chat" })
export class ChatGateway {
  @Subscribe({ event: "message" })
  onMessage(client: WebSocket, data: any) {
    console.log("Received message:", data);
    client.send(JSON.stringify({ event: "ack", data: "Received" }));
  }
}
