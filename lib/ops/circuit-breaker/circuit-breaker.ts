enum CircuitBreakerStatus {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export class CircuitBreaker<T> {
  private FAILURE_COUNT = 0;
  private FAILURE_THRESHOLD = 5;
  private status: CircuitBreakerStatus = CircuitBreakerStatus.CLOSED;
  private COOLDOWN_TIME = 10000;

  private SERVICE_FN: () => Promise<T>;

  private fallback?: () => Promise<T>;

  constructor(
    private serviceFn: () => Promise<T>,
    private failureThreshold: number = 5,
    private fallbackFn: () => Promise<T> = async () => {
      throw new Error("Fallback executed");
    }
  ) {
    this.SERVICE_FN = serviceFn;
    this.FAILURE_THRESHOLD = failureThreshold;
    this.fallback = fallbackFn;

    console.log(
      `Circuit breaker initialized with failure threshold: ${this.FAILURE_THRESHOLD}`
    );
  }

  public async execute(): Promise<T> {
    if (this.status === CircuitBreakerStatus.OPEN) {
      console.log("Circuit breaker is open. Cannot execute service function.");
      if (this.fallback) {
        console.log("Executing fallback function.");
        return this.fallback();
      } else {
        console.log("No fallback function provided.");
        return Promise.reject(new Error("Circuit breaker is open"));
      }
    }

    try {
      const result = await this.SERVICE_FN!();
      this.reset();
      return result;
    } catch (error) {
      this.FAILURE_COUNT++;
      console.log(`Failure count: ${this.FAILURE_COUNT}`);
      if (this.FAILURE_COUNT >= this.FAILURE_THRESHOLD) {
        this.open();
        setTimeout(() => {
          this.close();
        }, this.COOLDOWN_TIME);
      }
      return Promise.reject(error);
    }
  }

  private open() {
    this.status = CircuitBreakerStatus.OPEN;
    console.log("Circuit breaker opened");
  }

  private close() {
    this.status = CircuitBreakerStatus.CLOSED;
    console.log("Circuit breaker closed");
  }

  private reset() {
    this.status = CircuitBreakerStatus.CLOSED;
    this.FAILURE_COUNT = 0;
    console.log("Circuit breaker reset");
  }
}
