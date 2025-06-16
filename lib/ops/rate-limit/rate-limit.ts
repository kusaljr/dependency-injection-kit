import { Injectable } from "@express-di-kit/common";
import { CanActivate } from "@express-di-kit/common/middleware";

type RateLimitOptions = {
  capacity: number; // max tokens in the bucket
  refillRate: number; // tokens added per millisecond
  errorMessage?: string;
};

const ipBuckets: Record<string, { tokens: number; lastRefill: number }> = {};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private options: RateLimitOptions = {
    capacity: 5, // max 5 requests
    refillRate: 5 / 60000, // 5 tokens per 60,000 ms (1 minute)
    errorMessage: "Too many requests, please try again later.",
  };

  async canActivate(req: any, res: any) {
    try {
      const ip = String(req.ip);
      const now = Date.now();

      if (!ipBuckets[ip]) {
        ipBuckets[ip] = {
          tokens: this.options.capacity,
          lastRefill: now,
        };
      }

      const bucket = ipBuckets[ip];

      // Refill tokens
      const elapsed = now - bucket.lastRefill;
      const tokensToAdd = elapsed * this.options.refillRate;
      bucket.tokens = Math.min(
        this.options.capacity,
        bucket.tokens + tokensToAdd
      );
      bucket.lastRefill = now;

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return true;
      } else {
        if (res && typeof res.status === "function") {
          res.status(429).json({
            error: this.options.errorMessage,
          });
        }
        return false;
      }
    } catch (err) {
      console.error("RateLimitGuard error:", err);
      return false;
    }
  }
}
