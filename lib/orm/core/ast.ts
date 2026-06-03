export interface AstNode {
  line: number;
  column: number;
}

export interface SchemaNode extends AstNode {
  kind: "Schema";
  models: ModelNode[];
  enums?: EnumNode[];
  types?: TypeNode[];
}

export interface ModelNode extends AstNode {
  kind: "Model";
  name: string;
  fields: FieldNode[];
  combinedUniques?: string[][];
}

export enum RelationEnum {
  ONE_TO_MANY = "one_to_many",
  MANY_TO_ONE = "many_to_one",
  ONE_TO_ONE = "one_to_one",
  MANY_TO_MANY = "many_to_many",
}

export type FieldType =
  | "int"
  | "string"
  | "float"
  | "boolean"
  | "json"
  | "enum"
  | string;

export interface FieldNode extends AstNode {
  kind: "Field";
  name: string;
  fieldType: FieldType;
  isArray?: boolean;
  relation?: {
    type: RelationEnum;
    foreignKey?: string;
  };
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isNullable?: boolean;
  isRequired?: boolean;
  defaultValue?: string | number | boolean | { [key: string]: any };
  jsonTypeDefinition?: JsonTypeDefinitionNode;
  enumValues?: string[];
}

export interface JsonTypeDefinitionNode extends AstNode {
  kind: "JsonTypeDefinition";
  raw: string;
  isArray?: boolean; // indicates if this JSON type is an array
}

export interface JsonFieldNode extends AstNode {
  kind: "JsonField";
  name: string;
  fieldType: FieldType | JsonTypeDefinitionNode; // support nested JSON
  isArray?: boolean;
  isNullable?: boolean;
  isRequired?: boolean;
}

export interface EnumNode extends AstNode {
  kind: "Enum";
  name: string;
  values: string[];
}

export interface TypeNode extends AstNode {
  kind: "Type";
  name: string;
  fields: JsonFieldNode[];
}
