import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseMethodInterceptor,
} from "../../lib/decorators/express";
import { Injectable } from "../../lib/decorators/injectable";
import { CreateUserDto } from "./users.dto";
import { UserService } from "./users.service";

@Injectable()
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
  @UseMethodInterceptor((req, res, next) => {
    console.log("Inline Method Interceptor hit");
    next();
  })
  getRateLimit() {
    return {
      message: "Open for all",
    };
  }
}
