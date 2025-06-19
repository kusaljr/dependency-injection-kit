// AUTO-GENERATED FILE. DO NOT EDIT.

export type user = {
  id: number;
  name: string;
  products: product[];
};

export type product = {
  id: number;
  name: string;
  price: float;
  user_id: number;
  user: user;
};

export type barcode = {
  id: number;
  code: string;
};

export type ModelNames = "user" | "product" | "barcode";

export type Models = {
  user: user;
  product: product;
  barcode: barcode;
};