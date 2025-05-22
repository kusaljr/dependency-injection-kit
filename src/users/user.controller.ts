import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from "../../lib/decorators/express";
import { Injectable } from "../../lib/decorators/injectable";
import { RateLimit } from "../../lib/ops/rate-limit";
import { CreateUserDto } from "./users.dto";
import { UserService } from "./users.service";

@Injectable()
@RateLimit({
  limit: 5,
  windowMs: 30 * 1000,
  errorMessage: "Too many requests, please try again later.",
})
@Controller("/users")
export class UserController {
  constructor(private userService: UserService) {}

  @Post("/")
  createUser(@Body() body: CreateUserDto) {
    return {
      message: "User created",
    };
  }

  @Get("/:id")
  getUser(@Param("id") id: string) {
    return {
      message: "User found",
      id,
    };
  }

  @Get("/limit")
  getRateLimit() {
    return {
      message: "Open for all",
    };
  }
}
