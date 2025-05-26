import { Controller, Get, Post, Query } from "../../lib/decorators/express";
import { React } from "../../lib/ops/react/decorator";

@Controller("/user")
export class UserController {
  @Get("/")
  @React()
  getUser(@Query("id") id: string) {
    console.log("Fetching user with ID:", id);
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
