import { Injectable, TooManyRequestsException } from "@express-di-kit/common";
import {
  CallHandler,
  DiKitInterceptor,
  ExecutionContext,
} from "@express-di-kit/global/interceptor";

@Injectable()
export class RateLimitInterceptor implements DiKitInterceptor {
  private capacity = 5;
  private leakRate = 1000;
  private queue: number[] = [];

  intercept(context: ExecutionContext, next: CallHandler): Promise<any> {
    const httpContext = context.switchToHttp();
    const res = httpContext.getResponse();

    const now = Date.now();

    this.queue = this.queue.filter(
      (timestamp) => now - timestamp < this.capacity * this.leakRate
    );

    if (this.queue.length < this.capacity) {
      this.queue.push(now);
      return next.handle();
    } else {
      if (!res.headersSent()) {
        throw new TooManyRequestsException();
      }

      return Promise.resolve(null);
    }
  }
}
