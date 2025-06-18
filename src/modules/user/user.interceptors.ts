import { Injectable } from "@express-di-kit/common";
import {
  CallHandler,
  DiKitInterceptor,
  ExecutionContext,
} from "@express-di-kit/global/interceptor";
import { colorText } from "@express-di-kit/utils/colors";

@Injectable()
export class LoggingInterceptor implements DiKitInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<any> {
    const now = Date.now();
    try {
      const result = await next.handle();
      console.log(
        // request took xyz ms
        `Request ${colorText.green(
          context.switchToHttp().getRequest().url
        )} took ${colorText.green((Date.now() - now).toString())} ms`
      );
      return result;
    } catch (error) {
      console.error(`Error after ${Date.now() - now}ms:`, error);
      throw error;
    }
  }
}
