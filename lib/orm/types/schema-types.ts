// AUTO-GENERATED FILE. DO NOT EDIT.

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
  product_id : number;
  product? : product;
  created_at? : string;
  updated_at? : string;
};

export type product = {
  id? : number;
  name : string;
  description? : string;
  price : number;
  barcodes? : barcode;
};

export type ModelNames = "barcode" | "product";

export type Models = {
  barcode: barcode;
  product: product;
};