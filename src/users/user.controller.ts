import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from "../../lib/decorators/express";
import { Injectable } from "../../lib/decorators/injectable";
import { UserAuthService } from "./user-auth.service";
import { CreateUserDto } from "./users.dto";
import { UserService } from "./users.service";

@Injectable()
@Controller("/users")
export class UserController {
  constructor(
    private userService: UserService,
    private userAuthService: UserAuthService
  ) {}

  @Get("/:id")
  getUserById(@Param("id") id: string) {
    return {
      message: "User found",
      user: this.userAuthService.getUserById(parseInt(id)),
    };
  }

  @Post("/")
  createUser(@Body() body: CreateUserDto) {
    return {
      message: "User created",
    };
  }
}
