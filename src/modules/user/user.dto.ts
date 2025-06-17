import { Property } from "@express-di-kit/common";
import {
  IsArray,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "@express-di-kit/validator";
import { z } from "zod";

export class UserDto {
  @Property()
  @IsNumber()
  age!: number;

  @Property()
  @IsString()
  name!: string;

  @Property()
  @IsOptional()
  @IsEmail()
  email!: string;

  @Property()
  @IsOptional()
  @MinLength(5)
  @MaxLength(6)
  address!: string;

  @Property()
  @IsArray(z.string(), { min: 1, max: 5 })
  hobbies!: string[];
}
