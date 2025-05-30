import { Socket, Subscribe } from "@express-di-kit/socket";
import WebSocket from "ws";

@Socket({ namespace: "/chat" })
export class ChatGateway {
  @Subscribe({ event: "message" })
  onMessage(client: WebSocket, data: any) {
    console.log("Received message:", data);
    client.send(JSON.stringify({ event: "ack", data: "Received" }));
  }
}
