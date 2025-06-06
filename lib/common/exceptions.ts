export class HttpException extends Error {
  public readonly status: number;
  public readonly message: string;

  constructor(message: string, status: number) {
    super(message);
    this.message = message;
    this.status = status;
    Error.captureStackTrace(this, this.constructor);
  }

  toJson() {
    return {
      statusCode: this.status,
      message: this.message,
    };
  }
}

export class NotFoundException extends HttpException {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

export class BadRequestException extends HttpException {
  constructor(message = "Bad request") {
    super(message, 400);
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message = "Internal server error") {
    super(message, 500);
  }
}

export class MethodNotAllowedException extends HttpException {
  constructor(message = "Method not allowed") {
    super(message, 405);
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(message = "Service unavailable") {
    super(message, 503);
  }
}

export class GatewayTimeoutException extends HttpException {
  constructor(message = "Gateway timeout") {
    super(message, 504);
  }
}

export class ConflictException extends HttpException {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(message = "Too many requests") {
    super(message, 429);
  }
}

export class UnProcessableEntityException extends HttpException {
  constructor(message = "Unprocessable entity") {
    super(message, 422);
  }
}

export class NotImplementedException extends HttpException {
  constructor(message = "Not implemented") {
    super(message, 501);
  }
}
