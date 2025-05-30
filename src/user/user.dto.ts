import { Property } from "@express-di-kit/common";
import { IsNumber } from "@express-di-kit/validator";

export class UserDto {
  @Property()
  @IsNumber()
  age!: number;
}
