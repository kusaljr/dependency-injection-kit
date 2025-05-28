import { Injectable } from "../../lib/decorators/injectable";

@Injectable()
export class UserService {
  private users = [
    { id: 1, name: "Alice in the wonderland" },
    { id: 2, name: "Bob the builder" },
    { id: 3, name: "Charlie Chaplin" },
  ];

  getUserProfile() {
    return { name: "John Doe", age: 30 };
  }

  getUserList() {
    return this.users;
  }
}
