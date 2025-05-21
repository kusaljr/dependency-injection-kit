import { Injectable } from "../../lib/decorators/injectable";

@Injectable()
export class UserAuthService {
  private users = [
    { id: 1, name: "John Doe" },
    { id: 2, name: "Jane Smith" },
  ];

  getUserById(id: number) {
    return this.users.find((user) => user.id === id);
  }
}
