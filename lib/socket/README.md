

# ⚡️ WebSocket Gateway Framework

A lightweight, decorator-based WebSocket server for Node.js — built to integrate seamlessly with **Express-DI-Kit** and **Zod** validation.
Define real-time gateways, message DTOs, and typed event handling with minimal boilerplate.

---

## 🚀 Features

* 🧩 **Decorator-based API** (`@Socket`, `@Subscribe`, `@Client`, `@Data`)
* 🧠 **Automatic DTO validation** with Zod schemas
* 🔌 **Namespace support** (e.g., `/chat`, `/notifications`)
* 📜 **Auto-generated WebSocket documentation** via `socketOptions`
* ⚙️ **Unified configuration** alongside your REST API

---

## 📦 Installation

```bash
npm install @express-di-kit/socket @express-di-kit/validator ws zod
```

---

## ⚙️ 1. Configure Your Application

When bootstrapping your app, define both REST and WebSocket options inside your `AppConfig`:

```ts
import { z } from "zod";
import { AppConfig } from "@express-di-kit/core";

export const appConfig: AppConfig = {
  port: 3009,
  swaggerOptions: {
    title: "My Test API",
    version: "1.0.0",
    description: "API documentation for my application",
  },
  socketOptions: {
    title: "Socket Documentation",
    description: "WebSocket API documentation",
  },
  envSchema: z.object({
    PORT: z.string(),
    STRIPE_API_KEY: z.string().min(1, "STRIPE_API_KEY is required"),
  }),
};
```

> 🧠 `socketOptions` enables WebSocket gateway discovery and auto-documentation.
> The same app instance can host both REST routes and WebSocket namespaces.

---

## 💬 2. Create a WebSocket Gateway

Gateways are classes decorated with `@Socket()` that listen for incoming WebSocket events.
Each gateway should live in a file named with the suffix **`.gateway.ts`** or **`.socket.ts`**.

### Example: `chat.gateway.ts`

```ts
import { Socket, Subscribe, Client } from "@express-di-kit/socket";
import { Data } from "@express-di-kit/socket/decorator";
import { IsString } from "@express-di-kit/validator";
import WebSocket from "ws";

/** Data Transfer Object for incoming chat messages */
export class ChatMessageDto {
  @IsString()
  user!: string;

  @IsString()
  message!: string;
}

/** Chat gateway handling messages under /chat namespace */
@Socket({ namespace: "/chat" })
export class ChatGateway {
  @Subscribe({ event: "message", description: "Handles incoming chat messages" })
  onMessage(@Client() client: WebSocket, @Data() data: ChatMessageDto) {
    console.log(`[Chat] ${data.user}: ${data.message}`);

    // Echo acknowledgment back to the sender
    client.send(
      JSON.stringify({ event: "ack", data: "Message received successfully" })
    );
  }
}
```

### 🔍 Decorators

| Decorator                | Purpose                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `@Socket({ namespace })` | Registers a WebSocket namespace (e.g. `/chat`).                  |
| `@Subscribe({ event })`  | Subscribes a method to a specific client event.                  |
| `@Client()`              | Injects the connected WebSocket client.                          |
| `@Data()`                | Injects and validates the incoming data using the specified DTO. |

---

## 🧠 3. How It Works Internally

Your `WebSocketServer` automatically:

* Creates an HTTP + WebSocket server.
* Scans for `.gateway.ts` / `.socket.ts` files.
* Extracts metadata using decorators.
* Parses and validates `@Data()` payloads using `processBodyAndValidate()`.
* Injects `@Client()` (the socket instance).
* Calls the correct `@Subscribe()` handler for each incoming event.

You don’t need to manually register gateways — they’re discovered automatically.

---

## 🧪 4. Example Client Interaction

A simple WebSocket client sending a chat message:

```js
const ws = new WebSocket("ws://localhost:3009/chat");

ws.onopen = () => {
  console.log("✅ Connected to Chat Gateway");
  ws.send(
    JSON.stringify({
      event: "message",
      data: { user: "Alice", message: "Hello, world!" },
    })
  );
};

ws.onmessage = (msg) => {
  console.log("📩 Server response:", msg.data);
};
```

### Server Logs

```
🟢 Client connected
📩 Incoming message:
   Event: message
   Data: { user: 'Alice', message: 'Hello, world!' }
⚙️ Executing handler: ChatGateway.onMessage
[Chat] Alice: Hello, world!
```

---

## ❌ 5. Validation Errors

If the client sends invalid data:

```json
{"event": "message", "data": {"user": 123}}
```

The server automatically validates the payload and replies with a structured error:

### Server log

```
❌ Validation failed: [
  { path: ["user"], message: "Expected string, received number" },
  { path: ["message"], message: "Required" }
]
```

### Client receives

```json
{
  "event": "error",
  "data": {
    "message": "Validation failed",
    "errors": [
      { "path": ["user"], "message": "Expected string" },
      { "path": ["message"], "message": "Required" }
    ]
  }
}
```


