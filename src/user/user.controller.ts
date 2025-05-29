import { Controller, Get, Req } from "../../lib/decorators/express";
import { RateLimit } from "../../lib/ops/rate-limit/rate-limit";
import { React } from "../../lib/ops/react/decorator";
import { IsAuthenticated } from "./jwt-middleware";
import { UserService } from "./user.service";

@Controller("/user")
@RateLimit({
  limit: 5,
  windowMs: 30 * 1000,
  errorMessage: "Too many requests, please try again later.",
})
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/profile")
  getProfile() {
    return this.userService.getUserProfile();
  }

  @Get("/list")
  @React()
  @IsAuthenticated()
  getUserList(@Req req: Request & { user: { id: number; name: string } }) {
    return {
      data: {
        users: this.userService.getUserList(),
        currentUser: req.user,
      },
    };
  }
}
