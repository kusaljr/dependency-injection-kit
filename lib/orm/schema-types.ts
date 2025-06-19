// AUTO-GENERATED FILE. DO NOT EDIT.

export type user = {
  id: number;
  name: string;
  products: product[];
};

export type product = {
  id: number;
  name: string;
  user_id: number;
  user: user;
};

export type ModelNames = "user" | "product";

export type Models = {
  user: user;
  product: product;
};