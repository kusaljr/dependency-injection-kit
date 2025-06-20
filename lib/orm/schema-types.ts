// AUTO-GENERATED FILE. DO NOT EDIT.

export type users = {
  id? : number;
  name : string;
  email : string;
  products? : product[];
};

export type product = {
  id? : number;
  name : string;
  price? : number;
  user_id? : number;
  user? : users;
};

export type barcode = {
  id? : number;
  code : string;
  is_active? : boolean;
  created_at? : string;
  updated_at? : string;
};

export type ModelNames = "users" | "product" | "barcode";

export type Models = {
  users: users;
  product: product;
  barcode: barcode;
};