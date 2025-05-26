# Express Dependency Injection Library

## Overview
This library provides a simple and flexible way to manage dependencies in your Express applications. It allows you to define services and inject them into your routes, controllers, and middleware.

## Features

## Automatic Dependency Injection
 Automatically injects dependencies into your controllers, routes, and middleware based on the class constructor, you dont need to manually instantiate your classes and create instances of your services.

 Example:
```typescript
// Example Controller
import { Controller, Get, Inject } from 'express-dependency-injection';
@Controller('/example')
export class ExampleController {

  constructor( private exampleService: ExampleService) {}

  @Get('/')
  async getExample() {
    return this.exampleService.getData();
  }

}

// Example Service
import { Service } from 'express-dependency-injection';
@Injectable()
export class ExampleService {
  getData() {
    return { message: 'Hello from ExampleService!' };
  }
}
```




## React Server Rendering
 Support for server-side rendering with React components.
By using `@React()` decorator, you can render React components on the server and inject dependencies into them. By default it will generate a react component within modules views directory, you can modify the user interface to change the default behavior.

Example:
```typescript
import { Controller, Get, React } from 'express-dependency-injection';

@Controller('/example')
export class ExampleController {

  @Get('/')
  @React()
  async renderExample() {
    return { message: 'Hello from React!' };
  }

}
```