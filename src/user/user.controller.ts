import { Controller, Get, Post } from "../../lib/decorators/express";
import { React } from "../../lib/ops/react/decorator";

@Controller("/user")
export class UserController {
  @Get("/")
  @React()
  getUser() {
    return {
      data: {
        id: 1,
        name: "John Doe",
      },
    };
  }

  @Post("/create")
  createUser() {
    return {
      data: {
        id: 2,
        name: "Jane Doe",
      },
    };
  }
}
