import { Property } from "@express-di-kit/common";
import {
  IsEmail,
  IsFile,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "@express-di-kit/validator";

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

  // @Property()
  // @IsArray(z.string(), { min: 1, max: 5 })
  // hobbies!: string[];

  @IsFile({ mimeTypes: ["image/jpeg", "image/png"], maxSize: 5 * 1024 * 1024 }) // Max 5MB
  picture!: File;
}
