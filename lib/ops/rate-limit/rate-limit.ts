import { NextFunction, Request, Response } from "express";
import { useInterceptor } from "../../decorators/middleware";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  errorMessage?: string;
};

const ipRequestCounts: Record<
  string,
  { count: number; timer?: NodeJS.Timeout }
> = {};

export const rateLimitMiddleware = (options: RateLimitOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = String(req.ip);

    if (!ipRequestCounts[ip]) {
      ipRequestCounts[ip] = { count: 1 };
      ipRequestCounts[ip].timer = setTimeout(() => {
        delete ipRequestCounts[ip];
      }, options.windowMs);
    } else {
      ipRequestCounts[ip].count += 1;
    }

    if (ipRequestCounts[ip].count > options.limit) {
      return res.status(429).json({
        error:
          options.errorMessage ||
          `Rate limit exceeded. Try again in ${
            options.windowMs / 1000
          } seconds.`,
      });
    }

    next();
  };
};

export const RateLimit = (options: RateLimitOptions) =>
  useInterceptor(rateLimitMiddleware(options));
