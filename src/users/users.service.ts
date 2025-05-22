import { Injectable } from "../../lib/decorators/injectable";
import { CircuitBreaker } from "../../lib/ops/circuit-breaker/circuit-breaker";

@Injectable()
export class UserService {
  users = [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ];

  getUsers() {
    return this.users;
  }

  createUser(name: string) {
    return { id: Math.random(), name };
  }

  getUserById(id: number) {
    return this.users.find((user) => user.id === id);
  }

  @CircuitBreaker({
    failureThreshold: 1,
    fallbackFn: async () => "Fallback response",
    cooldownTime: 5000,
    enableLogging: true,
  })
  async unstableMethod() {
    // Simulate a method that may fail
    const random = Math.random();
    if (random < 0.5) {
      throw new Error("Simulated failure");
    }

    return "Success";
  }
}
