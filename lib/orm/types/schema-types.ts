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
  created_at? : string;
  updated_at? : string;
};

export type ModelNames = "barcode";

export type Models = {
  barcode: barcode;
};