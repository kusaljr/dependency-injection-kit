import {
  getSchema,
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  PartialType,
} from "./decorator";

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

describe("Validator Decorators", () => {
  it("should validate partial type", () => {
    const schema = getSchema(UpdateBarcodeDto);
    const parseddata = schema.safeParse({
      code: "1234567890",
      is_active: true,
    });

    expect(parseddata.success).toBe(true);
  });

  it("should validate barcode metadata", () => {
    const schema = getSchema(BarcodeDto);
    const parseddata = schema.safeParse({
      code: "1234567890",
      is_active: true,
      metadata: {
        type: {
          nonce: "abc123",
          hash: "hashvalue",
        },
        ingredients: ["ingredient1", "ingredient2"],
        calories: 200,
        code_type: "QR",
        description: "Sample barcode",
        non_vegetarian: false,
      },
    });

    expect(parseddata.success).toBe(true);
  });

  it("should throw error for invalid barcode metadata", () => {
    const schema = getSchema(BarcodeDto);
    expect(() =>
      schema.parse({
        code: "1234567890",
        is_active: true,
        metadata: {
          type: {
            nonce: "abc123",
            hash: "hashvalue",
          },
          ingredients: ["ingredient1", "ingredient2"],
          calories: 123,
          code_type: "QR",
          description: "Sample barcode",
          non_vegetarian: "false", // ❌ invalid
        },
      })
    ).toThrow(/Expected boolean, received string/);
  });
});
