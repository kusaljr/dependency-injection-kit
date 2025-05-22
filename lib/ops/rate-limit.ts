import { NextFunction, Request, Response } from "express";
import { createDecorator } from "../decorators/middleware";

const ipRequestCounts: Record<
  string,
  { count: number; timer?: NodeJS.Timeout }
> = {};

export const rateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const ip = String(req.ip);

  if (!ipRequestCounts[ip]) {
    ipRequestCounts[ip] = { count: 1 };
    // Reset after 10 minutes
    ipRequestCounts[ip].timer = setTimeout(() => {
      delete ipRequestCounts[ip];
    }, 10 * 60 * 1000);
  } else {
    ipRequestCounts[ip].count += 1;
  }

  if (ipRequestCounts[ip].count > 5) {
    return res.status(429).json({ error: "Too Many Requests" });
  }

  next();
};

export const RateLimit = createDecorator(rateLimitMiddleware);
