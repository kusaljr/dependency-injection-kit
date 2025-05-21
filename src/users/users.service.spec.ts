import { describe } from "@jest/globals";
import { UserService } from "./users.service";

describe("UsersService", () => {
  let service: UserService;
  beforeAll(() => {
    service = new UserService();
  });
  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should return all users", () => {
    const users = service.getUsers();
    expect(users).toEqual([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
  });

  it("should create a user", () => {
    const newUser = service.createUser("Charlie");
    expect(newUser).toEqual({ id: expect.any(Number), name: "Charlie" });
  });

  it("should return a user by ID", () => {
    const user = service.getUserById(1);
    expect(user).toEqual({ id: 1, name: "Alice" });
  });
});
