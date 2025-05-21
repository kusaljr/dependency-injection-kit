import { describe, expect, it } from "@jest/globals";
import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  let circuitBreaker: CircuitBreaker<number>;
  let serviceFn: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, "setTimeout");
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  it("should initialize with default values", () => {
    serviceFn = jest.fn().mockResolvedValue(42);
    circuitBreaker = new CircuitBreaker(serviceFn);
    expect(circuitBreaker).toBeInstanceOf(CircuitBreaker);

    expect(circuitBreaker.execute()).resolves.toBe(42);
  });
  it("should throw an error when the service function fails", async () => {
    serviceFn = jest.fn().mockRejectedValue(new Error("Service error"));
    const fallbackFn = jest
      .fn()
      .mockRejectedValue(new Error("Fallback error passed"));
    circuitBreaker = new CircuitBreaker(serviceFn, 1, fallbackFn);

    await expect(circuitBreaker.execute()).rejects.toThrow("Service error");
    expect(serviceFn).toHaveBeenCalled();

    await expect(circuitBreaker.execute()).rejects.toThrow(
      "Fallback error passed"
    );
    expect(fallbackFn).toHaveBeenCalled();
    jest.runAllTimers();
  });
});
