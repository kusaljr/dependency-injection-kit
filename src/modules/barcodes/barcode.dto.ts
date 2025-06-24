import { IsBoolean, IsObject, IsString } from "@express-di-kit/validator";
import { z } from "zod";

interface BarcodeMetadata {
  type: {
    nonce: string;
    hash: string;
  };
  ingredients: string[];
  calories?: number;
  code_type?: string;
  description: string;
  non_vegetarian: boolean;
}

export class BarcodeDto {
  @IsString()
  code?: string;

  @IsBoolean()
  is_active?: boolean;

  @IsObject(
    z.object({
      type: z.object({
        nonce: z.string(),
        hash: z.string(),
      }),
      ingredients: z.array(z.string()),
      calories: z.number().optional(),
      code_type: z.string().optional(),
      description: z.string(),
      non_vegetarian: z.boolean(),
    })
  )
  metadata?: BarcodeMetadata;
}
