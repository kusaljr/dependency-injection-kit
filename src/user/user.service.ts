import { Injectable } from "../../lib/decorators/injectable";

@Injectable()
export class UserService {
  private users = [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
    { id: 3, name: "Charlie" },
  ];

  getUserProfile() {
    return { name: "John Doe", age: 30 };
  }

  getUserList() {
    return this.users;
  }
}
