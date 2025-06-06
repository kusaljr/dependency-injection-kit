# Dependency Injection Library

## Overview

This library provides a simple and flexible way to manage dependencies in your application, which serves as a full stack framework with in the box features like automatic dependency injection, validation, middleware injection, React server rendering, and WebSocket integration.

It is designed to work with `Bun.js`, allowing you to build modern web applications with ease. The library uses decorators to define controllers, services, and middleware, making it easy to organize your code and manage dependencies.

[GitHub Repository](https://github.com/kusaljr/dependency-injection-kit)

## Features

## Automatic Dependency Injection

Automatically injects dependencies into your controllers, routes, and middleware based on the class constructor, you dont need to manually instantiate your classes and create instances of your services.

Example:

```typescript
// Example Controller
import { Controller, Get } from "express-di-kit/common";
@Controller("/example")
export class ExampleController {
  constructor(private exampleService: ExampleService) {}

  @Get("/")
  async getExample() {
    return this.exampleService.getData();
  }
}

// Example Service
import { Injectable } from "express-di-kit/common";
@Injectable()
export class ExampleService {
  getData() {
    return { message: "Hello from ExampleService!" };
  }
}
```

### Validation

The library supports validation of request parameters, query strings, and body data using decorators. You can define validation rules using in built validators which uses `zod` under the hood.

You can check the [validator documentation](./lib/validator/README.md) for more details on how to use the validation decorators.

Example:

```typescript
import { Property } from "express-di-kit/common";
import { IsString, IsNumber } from "express-di-kit/validator";
export class UserDto {
  @Property()
  @IsNumber()
  age!: number;
}

import { Controller, Post, Body } from "express-di-kit/common";
import { UserDto } from "./user.dto";
@Controller("/user")
export class UserController {
  @Post("/")
  async createUser(@Body() user: UserDto) {
    return { message: "User created successfully!", user };
  }
}
```

### Exception Handling
The library provides built-in exception handling for common HTTP errors. You can throw exceptions in your controllers, and they will be automatically handled and returned as HTTP responses.
Example:

```typescript
import { Controller, Get, NotFoundException } from "express-di-kit/common";
@Controller("/example")
export class ExampleController {
  @Get("/:id")
  async getExampleById(id: string) {
    // Simulate a scenario where the resource is not found
    if (id !== "1") {
      throw new NotFoundException("Resource not found");
    }
    return { message: "Resource found" };
  }
}
```

Available exceptions include:
- `BadRequestException`
- `UnauthorizedException`
- `ForbiddenException`
- `NotFoundException`
- `MethodNotAllowedException`
- `InternalServerErrorException`
- `ServiceUnavailableException`
- `GatewayTimeoutException`
- `ConflictException`
- `TooManyRequestsException`
- `UnprocessableEntityException`
- `NotImplementedException`
- `HttpException`
- `HttpStatusException`
- `HttpErrorException`
- `HttpExceptionFilter`

### Middleware Injection

You can also inject services into your middleware functions. This allows you to use your services in your middleware logic without having to manually instantiate them.

Example:

```typescript
import { useInterceptor } from "express-di-kit/common";

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(req: any) {
    throw new ForbiddenException(
      "You are not authorized to access this resource. Please log in."
    );
    return true;
  }
}


import { Controller, Get } from "express-di-kit/common";
@Controller("/example")
export class ExampleController {
  constructor(private exampleService: ExampleService) {}

  @Get("/")
  @UseGuards(AuthGuard)
  async getExample(req: Request, res: Response) {
    // Access the user from the request object
    const user = (req as any).user;
    return this.exampleService.getData(user);
  }
}
```

## React Server Rendering

Support for server-side rendering with React components.
By using `@React()` decorator, you can render React components on the server and inject dependencies into them. By default it will generate a react component within modules views directory, you can modify the user interface to change the default behavior.

Example:

```typescript
import { Controller, Get } from "express-di-kit/common";
import { React } from "express-di-kit/static";

@Controller("/example")
export class ExampleController {
  @Get("/")
  @React()
  async renderExample() {
    return { message: "Hello from React!" };
  }
}
```


