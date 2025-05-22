enum CircuitBreakerStatus {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export class CircuitBreakerClass<T = any> {
  private failureCount = 0;
  private status: CircuitBreakerStatus = CircuitBreakerStatus.CLOSED;

  private readonly serviceFn: () => Promise<T>;
  private readonly failureThreshold: number;
  private readonly cooldownTime: number;
  private readonly fallbackFn: () => Promise<T>;
  private readonly enableLogging: boolean;

  constructor(
    serviceFn: () => Promise<T>,
    failureThreshold: number = 5,
    fallbackFn: () => Promise<T> = async () => {
      throw new Error("Fallback executed");
    },
    cooldownTime: number = 10000,
    enableLogging: boolean = false
  ) {
    this.serviceFn = serviceFn;
    this.failureThreshold = failureThreshold;
    this.cooldownTime = cooldownTime;
    this.fallbackFn = fallbackFn;
    this.enableLogging = enableLogging;

    this.log(
      `Circuit breaker initialized. Threshold: ${this.failureThreshold}, Cooldown: ${this.cooldownTime}ms`
    );
  }

  public async execute(): Promise<T> {
    switch (this.status) {
      case CircuitBreakerStatus.OPEN:
        this.log("Circuit is OPEN. Rejecting call.");
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
      const result = await this.serviceFn();
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
      const result = await this.serviceFn();
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
      console.log(`[CircuitBreaker]: ${message}`);
    }
  }

  public getStatus(): CircuitBreakerStatus {
    return this.status;
  }
}

export function CircuitBreaker<T = any>({
  failureThreshold = 5,
  fallbackFn = async () => {
    throw new Error("Fallback executed");
  },
  cooldownTime = 10000,
  enableLogging = false,
}: {
  failureThreshold?: number;
  fallbackFn?: () => Promise<T>;
  cooldownTime?: number;
  enableLogging?: boolean;
}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    const breaker = new CircuitBreakerClass<T>(
      () => originalMethod.apply(target),
      failureThreshold,
      fallbackFn,
      cooldownTime,
      enableLogging
    );

    descriptor.value = function (...args: any[]) {
      return breaker.execute();
    };
  };
}
