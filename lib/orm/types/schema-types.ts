// AUTO-GENERATED FILE. DO NOT EDIT.

export type ProductStatus = "ACTIVE" | "INACTIVE" | "DRAFT" | "ARCHIVED";

export type barcode = {
  id? : number;
  code : string;
  is_active? : boolean;
  metadata? : { description: string
    non_vegetarian: boolean
    type : {
      nonce: string
      hash: string
    }
    ingredients: string[]
    calories?: number  
    code_type?: string };
  product_id? : number;
  product? : product;
  created_at? : string;
  updated_at? : string;
};

export type brand = {
  id? : number;
  name : string;
  description? : string;
  products? : product;
  created_at? : string;
  updated_at? : string;
};

export type category = {
  id? : number;
  name : string;
  description? : string;
  products? : product;
  created_at? : string;
  updated_at? : string;
};

export type ModelNames = "barcode" | "brand" | "category";

export type Models = {
  barcode: barcode;
  brand: brand;
  category: category;
};