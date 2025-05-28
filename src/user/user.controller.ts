import { Controller, Get } from "../../lib/decorators/express";
import { React } from "../../lib/ops/react/decorator";
import { UserService } from "./user.service";

@Controller("/user")
export class UserController {
  constructor(private readonly userService: UserService) {
    // Initialization if needed
  }

  @Get("/profile")
  getProfile() {
    return this.userService.getUserProfile();
  }

  @Get("/list")
  @React()
  getUserList() {
    return {
      data: this.userService.getUserList(),
    };
  }
}
