import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Req,
} from "@express-di-kit/common";

import { UseInterceptors } from "@express-di-kit/global/interceptor";
import { CircuitBreakerInterceptor } from "@express-di-kit/ops/circuit-breaker/circuit-breaker";
import { React } from "@express-di-kit/static";
import { pageResponse } from "@express-di-kit/static/decorator";
import { UserDto } from "./user.dto";
import { UserService } from "./user.service";

@Controller("/user")
// @UseInterceptors(RateLimitInterceptor)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/profile")
  // @UseInterceptors(LoggingInterceptor)
  @UseInterceptors(CircuitBreakerInterceptor)
  getProfile(@Req req: Request & { user: { id: number; name: string } }) {
    // if (Math.random() < 0.5) {
    throw new BadRequestException("Simulated error for circuit breaker test");
    // }
    // return this.userService.getUserProfile();
  }

  @Get("/list")
  @React()
  getUserList(@Req req: Request & { user: { id: number; name: string } }) {
    return pageResponse(
      {
        title: "User List",
        description: "List of all users",
      },
      {
        users: this.userService.getUserList(),
        currentUser: req.user,
      }
    );
  }

  @Get("/details/:id")
  @React()
  getUserDetails(@Req req: Request & { params: { id: string } }) {
    return pageResponse(
      {
        title: "User Details",
        description: "Details of a specific user",
      },
      {
        user: {
          id: req.params.id,
          name: "John Doe",
        },
      }
    );
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
