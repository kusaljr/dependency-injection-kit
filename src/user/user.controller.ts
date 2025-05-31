import {
  Body,
  CircuitBreaker,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  RateLimit,
  Req,
} from "@express-di-kit/common";

import { React } from "@express-di-kit/static";
import { IsAuthenticated } from "./jwt-middleware";
import { UserDto } from "./user.dto";
import { UserService } from "./user.service";

@Controller("/user")
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
  @RateLimit({
    limit: 5,
    windowMs: 30 * 1000,
    errorMessage: "Too many requests, please try again later.",
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

  @Post("/create")
  createUser(@Body() body: UserDto) {
    console.log("Creating user with data:", body);
    return "User created successfully!";
  }

  @Patch("/update")
  updateUser() {
    return "User updated successfully!";
  }

  @Put("/replace")
  replaceUser(@Body() body: UserDto) {
    console.log("Replacing user with data:", body);
    return "User replaced successfully!";
  }

  @Delete("/delete")
  deleteUser() {
    return "User deleted successfully!";
  }
}
