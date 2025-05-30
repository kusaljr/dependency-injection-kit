# Express Dependency Injection Library

## Overview
This library provides a simple and flexible way to manage dependencies in your Express applications. It allows you to define services and inject them into your routes, controllers, and middleware.

## Features

## Automatic Dependency Injection
 Automatically injects dependencies into your controllers, routes, and middleware based on the class constructor, you dont need to manually instantiate your classes and create instances of your services.

 Example:
```typescript
// Example Controller
import { Controller, Get } from 'express-di-kit/common';
@Controller('/example')
export class ExampleController {

  constructor( private exampleService: ExampleService) {}

  @Get('/')
  async getExample() {
    return this.exampleService.getData();
  }

}

// Example Service
import { Injectable } from 'express-di-kit/common';
@Injectable()
export class ExampleService {
  getData() {
    return { message: 'Hello from ExampleService!' };
  }
}
```


### Middleware Injection
 You can also inject services into your middleware functions. This allows you to use your services in your middleware logic without having to manually instantiate them.

 Example:
```typescript
import { useInterceptor } from 'express-di-kit/common';

export const MiddlewareFunction = () =>
  useInterceptor((req: Request, res: Response, next: NextFunction) => {
    // Simulate user authentication
    (req as any).user = { id: 1, name: "Test User" };
    next();
  });


import { Controller, Get } from 'express-di-kit/common';
@Controller('/example')
export class ExampleController {

  constructor(private exampleService: ExampleService) {}

  @Get('/')
  @MiddlewareFunction()
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
import { Controller, Get } from 'express-di-kit/common';
import {  React } from 'express-di-kit/static';

@Controller('/example')
export class ExampleController {

  @Get('/')
  @React()
  async renderExample() {
    return { message: 'Hello from React!' };
  }

}
```

### Add Packages 
You can add client side packages by running the following command:
```bash
npm run client ${packageName}
```
This will generate a esm imports in `react-importmap.json` file and automatically added to final client bundle.


## Websocket Integration
 The library supports WebSocket integration, allowing you to create WebSocket handlers and inject dependencies into them.

 Example:
```typescript
import { Socket, Subscribe } from 'express-di-kit/socket';

@Socket('/example')
export class ExampleSocket {

  constructor(private exampleService: ExampleService) {}

  @Subscribe('message')
  async onMessage(data: any) {
    return this.exampleService.processMessage(data);
  }

}
```