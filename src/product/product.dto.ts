import { Property } from "../../lib/decorators/express";

export class CreateProductDto {
  @Property()
  name!: string;
}
