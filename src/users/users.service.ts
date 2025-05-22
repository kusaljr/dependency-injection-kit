import { Injectable } from "../../lib/decorators/injectable";

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
}
