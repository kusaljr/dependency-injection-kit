import { Controller, Get, Req } from "@express-di-kit/decorators/express";
import { CircuitBreaker } from "@express-di-kit/ops/circuit-breaker/circuit-breaker";
import { RateLimit } from "@express-di-kit/ops/rate-limit/rate-limit";
import { React } from "@express-di-kit/ops/react/decorator";
import { IsAuthenticated } from "./jwt-middleware";
import { UserService } from "./user.service";

@Controller("/user")
@RateLimit({
  limit: 5,
  windowMs: 30 * 1000,
  errorMessage: "Too many requests, please try again later.",
})
@IsAuthenticated()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/profile")
  @CircuitBreaker({
    cooldownTime: 60 * 1000,
    enableLogging: true,
    failureThreshold: 0.5,
    fallbackFn() {
      return Promise.resolve({
        error: "Service is currently unavailable, please try again later.",
      });
    },
  })
  getProfile() {
    return this.userService.getUserProfile();
  }

  @Get("/list")
  @React()
  getUserList(@Req req: Request & { user: { id: number; name: string } }) {
    return {
      data: {
        users: this.userService.getUserList(),
        currentUser: req.user,
      },
    };
  }
}
