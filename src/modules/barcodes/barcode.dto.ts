import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from "@express-di-kit/validator";
import { PartialType } from "@express-di-kit/validator/decorator";

class BarcodeMetadataType {
  @IsString()
  nonce!: string;

  @IsString()
  hash!: string;
}

class BarcodeMetadata {
  @IsObject(BarcodeMetadataType)
  type!: BarcodeMetadataType;

  @IsArray(String, { min: 1, max: 10 })
  ingredients!: string[];

  @IsOptional()
  @IsNumber()
  calories?: number;

  @IsOptional()
  @IsString()
  code_type?: string;

  @IsString()
  description!: string;

  @IsBoolean()
  non_vegetarian!: boolean;
}

export class BarcodeDto {
  @IsString()
  code?: string;

  @IsBoolean()
  is_active?: boolean;

  @IsObject(BarcodeMetadata)
  metadata?: BarcodeMetadata;
}

export class UpdateBarcodeDto extends PartialType(BarcodeDto, { deep: true }) {}
