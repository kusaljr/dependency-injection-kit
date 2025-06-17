import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  RateLimitGuard,
  Req,
} from "@express-di-kit/common";

import { UseGuards } from "@express-di-kit/common/middleware";
import { React } from "@express-di-kit/static";
import { UserDto } from "./user.dto";
import { UserService } from "./user.service";

@Controller("/user")
@UseGuards(RateLimitGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("/profile")
  getProfile(@Req req: Request & { user: { id: number; name: string } }) {
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

  @Get("/details/:id")
  @React()
  getUserDetails(@Req req: Request & { params: { id: string } }) {
    return {
      data: {
        user: {
          id: req.params.id,
          name: "John Doe",
        },
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
