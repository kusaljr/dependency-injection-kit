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
