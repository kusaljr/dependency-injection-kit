import { Injectable } from "@express-di-kit/common";

enum CircuitBreakerStatus {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

@Injectable()
export class CircuitBreakerClass<T = any> {
  private failureCount = 0;
  private status: CircuitBreakerStatus = CircuitBreakerStatus.CLOSED;

  private serviceFn?: () => Promise<T>;
  private failureThreshold: number = 5;
  private cooldownTime: number = 10000;
  private fallbackFn: () => Promise<T> = async () => {
    throw new Error("Fallback executed");
  };
  private enableLogging: boolean = false;

  constructor() {}

  public configure(options: {
    serviceFn: () => Promise<T>;
    failureThreshold?: number;
    fallbackFn?: () => Promise<T>;
    cooldownTime?: number;
    enableLogging?: boolean;
  }) {
    this.serviceFn = options.serviceFn;
    if (options.failureThreshold !== undefined)
      this.failureThreshold = options.failureThreshold;
    if (options.cooldownTime !== undefined)
      this.cooldownTime = options.cooldownTime;
    if (options.fallbackFn !== undefined) this.fallbackFn = options.fallbackFn;
    if (options.enableLogging !== undefined)
      this.enableLogging = options.enableLogging;

    this.log(
      `\x1b[33mCircuit breaker configured. Threshold: ${this.failureThreshold}, Cooldown: ${this.cooldownTime}ms\x1b[0m`
    );
  }

  public async execute(): Promise<T> {
    if (!this.serviceFn) {
      throw new Error("CircuitBreaker serviceFn is not configured.");
    }

    switch (this.status) {
      case CircuitBreakerStatus.OPEN:
        this.log("\x1b[31mCircuit is OPEN. Rejecting call.\x1b[0m");
        return this.executeFallback();

      case CircuitBreakerStatus.HALF_OPEN:
        return this.tryHalfOpen();

      case CircuitBreakerStatus.CLOSED:
      default:
        return this.tryService();
    }
  }

  private async tryService(): Promise<T> {
    try {
      const result = await this.serviceFn!();
      this.reset();
      return result;
    } catch (error) {
      this.failureCount++;
      this.log(`Service failed. Failure count: ${this.failureCount}`);

      if (this.failureCount >= this.failureThreshold) {
        this.open();
      }

      throw error;
    }
  }

  private async tryHalfOpen(): Promise<T> {
    this.log("Circuit is HALF_OPEN. Trying one request.");
    try {
      const result = await this.serviceFn!();
      this.reset();
      return result;
    } catch (error) {
      this.open();
      throw error;
    }
  }

  private open() {
    this.status = CircuitBreakerStatus.OPEN;
    this.log("Circuit breaker OPENED. Starting cooldown.");

    setTimeout(() => {
      this.status = CircuitBreakerStatus.HALF_OPEN;
      this.log("Cooldown ended. Circuit is now HALF_OPEN.");
    }, this.cooldownTime);
  }

  private reset() {
    this.failureCount = 0;
    this.status = CircuitBreakerStatus.CLOSED;
    this.log("Circuit breaker RESET. Status is CLOSED.");
  }

  private async executeFallback(): Promise<T> {
    try {
      this.log("Executing fallback function.");
      return await this.fallbackFn();
    } catch (fallbackError) {
      this.log("Fallback function failed.");
      throw new Error("Circuit breaker is open and fallback failed");
    }
  }

  private log(message: string) {
    if (this.enableLogging) {
      if (this.status === CircuitBreakerStatus.OPEN) {
        console.error(`\x1b[31m[CircuitBreaker]: ${message}\x1b[0m`);
      } else if (this.status === CircuitBreakerStatus.HALF_OPEN) {
        console.warn(`\x1b[33m[CircuitBreaker]: ${message}\x1b[0m`);
      } else {
        console.log(`\x1b[32m[CircuitBreaker]: ${message}\x1b[0m`);
      }
    }
  }

  public getStatus(): CircuitBreakerStatus {
    return this.status;
  }
}
