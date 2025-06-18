import {
  Injectable,
  ServiceUnavailableException,
} from "@express-di-kit/common";
import {
  CallHandler,
  DiKitInterceptor,
  ExecutionContext,
} from "@express-di-kit/global/interceptor";

enum State {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

@Injectable()
export class CircuitBreakerInterceptor implements DiKitInterceptor {
  private state: State = State.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;

  private readonly coolDownTime: number = 5000;
  private readonly failureThreshold: number = 5;
  private readonly successThreshold: number = 3;

  async intercept(context: ExecutionContext, next: CallHandler): Promise<any> {
    const now = Date.now();
    console.log(`[CircuitBreaker] Current State: ${this.state}`);

    if (this.state === State.OPEN) {
      const elapsed = now - this.lastFailureTime;
      if (elapsed >= this.coolDownTime) {
        console.log(
          `[CircuitBreaker] Cooldown expired (${elapsed}ms), transitioning to HALF_OPEN`
        );
        this.state = State.HALF_OPEN;
      } else {
        console.warn(
          `[CircuitBreaker] Circuit is OPEN, rejecting call. ${
            this.coolDownTime - elapsed
          }ms remaining`
        );
        throw new ServiceUnavailableException("Circuit breaker: OPEN");
      }
    }

    try {
      const result = await next.handle();
      this.handleSuccess();
      return result;
    } catch (err) {
      this.handleFailure();
      throw err;
    }
  }

  private handleFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    console.error(
      `[CircuitBreaker] Failure occurred. Count: ${this.failureCount}`
    );

    if (this.failureCount >= this.failureThreshold) {
      this.state = State.OPEN;
      console.warn(
        `[CircuitBreaker] Failure threshold reached (${this.failureThreshold}). Transitioning to OPEN`
      );
    }
  }

  private handleSuccess() {
    if (this.state === State.HALF_OPEN) {
      this.successCount++;
      console.log(
        `[CircuitBreaker] HALF_OPEN success. Success count: ${this.successCount}/${this.successThreshold}`
      );

      if (this.successCount >= this.successThreshold) {
        console.log(
          `[CircuitBreaker] Success threshold met. Resetting to CLOSED.`
        );
        this.reset();
      }
    } else {
      console.log(
        `[CircuitBreaker] Successful call in state: ${this.state}. Resetting.`
      );
      this.reset();
    }
  }

  private reset() {
    this.failureCount = 0;
    this.successCount = 0;
    this.state = State.CLOSED;
    console.log(`[CircuitBreaker] Reset to CLOSED state.`);
  }
}
