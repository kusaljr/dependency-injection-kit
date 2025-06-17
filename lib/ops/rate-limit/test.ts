import { Injectable } from "@express-di-kit/common";
import { DikitInterceptor } from "@express-di-kit/global/interceptor";

@Injectable()
export class RateLimitInterceptor implements DikitInterceptor {
  private lastCall = 0;
  private interval = 1000; // 1 call per second

  intercept(target: Function, context: any, args: any[]): any {
    console.log(`RateLimitInterceptor: ${target.name} called with args:`, args);
    const now = Date.now();
    if (now - this.lastCall < this.interval) {
      console.warn(`Rate limit exceeded: ${target.name}`);
      return;
    }
    this.lastCall = now;
    return target.apply(context, args);
  }
}
