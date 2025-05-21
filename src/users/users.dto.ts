import { Property } from "../../lib/decorators/express";

export class CreateUserDto {
  @Property()
  name!: string;

  @Property()
  email!: string;

  @Property()
  password!: string;
}
