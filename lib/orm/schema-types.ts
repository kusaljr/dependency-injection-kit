// AUTO-GENERATED FILE. DO NOT EDIT.

export type Models = {
  user: {
    id: number;
    name: string;
  };
  product: {
    id: number;
    name: string;
  };
};

export type ModelNames = keyof Models;
export type FieldsOf<M extends ModelNames> = keyof Models[M];