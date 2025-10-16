import { Socket, Subscribe } from "@express-di-kit/socket";
import { Client, Data } from "@express-di-kit/socket/decorator";
import { IsBoolean, IsString } from "@express-di-kit/validator";
import WebSocket from "ws";

export class BarcodeDto {
  @IsString()
  code?: string;

  @IsBoolean()
  is_active?: boolean;
}

@Socket({ namespace: "/chat" })
export class ChatGateway {
  @Subscribe({ event: "message" })
  onMessage(@Client() client: WebSocket, @Data() data: BarcodeDto) {
    console.log("Received message:", data);
    client.send(JSON.stringify({ event: "ack", data: "Received" }));
  }
}
