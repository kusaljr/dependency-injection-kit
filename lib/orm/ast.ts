export interface AstNode {
  line: number;
  column: number;
}

export interface SchemaNode extends AstNode {
  kind: "Schema";
  models: ModelNode[];
  types?: TypeNode[]; // NEW: Support for custom types (e.g. JSON shapes)
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
}

export type FieldType =
  | "int"
  | "string"
  | "float"
  | "boolean"
  | "json"
  | string; // allow custom types (e.g. json type names)

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
  defaultValue?: string | number | boolean | object;
  jsonTypeDefinition?: JsonTypeDefinitionNode; // NEW: inline JSON type definition
}

export interface JsonTypeDefinitionNode extends AstNode {
  kind: "JsonTypeDefinition";
  fields: JsonFieldNode[];
}

export interface JsonFieldNode extends AstNode {
  kind: "JsonField";
  name: string;
  fieldType: FieldType | JsonTypeDefinitionNode; // support nested JSON
  isArray?: boolean;
  isNullable?: boolean;
  isRequired?: boolean;
}

// NEW: support custom type declarations (like `type Foo { ... }`)
export interface TypeNode extends AstNode {
  kind: "Type";
  name: string;
  fields: JsonFieldNode[];
}
