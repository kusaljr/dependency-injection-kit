import { Injectable } from "@express-di-kit/common";
import { CanActivate } from "@express-di-kit/common/middleware";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  errorMessage?: string;
};

const ipRequestCounts: Record<
  string,
  { count: number; timer?: NodeJS.Timeout }
> = {};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private options: RateLimitOptions = {
    limit: 5,
    windowMs: 60 * 1000,
    errorMessage: "Too many requests, please try again later.",
  };

  async canActivate(req: any, res: any) {
    try {
      const ip = String(req.ip);

      console.log("RateLimitGuard checking IP:", ip);

      if (!ipRequestCounts[ip]) {
        ipRequestCounts[ip] = { count: 1 };
        ipRequestCounts[ip].timer = setTimeout(() => {
          delete ipRequestCounts[ip];
        }, this.options.windowMs);
      } else {
        ipRequestCounts[ip].count += 1;
      }

      if (ipRequestCounts[ip].count > this.options.limit) {
        if (res && typeof res.status === "function") {
          res.status(429).json({
            error:
              this.options.errorMessage ||
              `Rate limit exceeded. Try again in ${
                this.options.windowMs / 1000
              } seconds.`,
          });
        }

        return false;
      }

      return true;
    } catch (err) {
      console.error("RateLimitGuard error:", err);
      return false;
    }
  }
}
