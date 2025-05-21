import { Injectable } from "../../lib/decorators/injectable";

@Injectable()
export class UserService {
  getUsers() {
    return [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];
  }

  createUser(name: string) {
    return { id: Math.random(), name };
  }

  getUserById(id: number) {
    const users = this.getUsers();
    return users.find((user) => user.id === id);
  }
}
