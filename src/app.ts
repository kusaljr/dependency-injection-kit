import { createApp } from "@express-di-kit/common";
import { z } from "zod";

async function bootstrap() {
  const appConfig = {
    port: 3000,
    swaggerOptions: {
      title: "My Test API",
      version: "1.0.0",
      description: "API documentation for my application",
    },

    envSchema: z.object({
      PORT: z.string(),
      STRIPE_API_KEY: z.string().min(1, "STRIPE_API_KEY is required"),
    }),

    // asyncApiOptions: {
    //   title: "Socket Documentation",
    // },
  };

  try {
    const app = await createApp(appConfig);
    app.listen();
  } catch (error) {
    console.error("Error during application bootstrap:", error);
    process.exit(1);
  }
}

bootstrap();
