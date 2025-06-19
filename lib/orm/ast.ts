export interface AstNode {
  line: number;
  column: number;
}

export interface SchemaNode extends AstNode {
  kind: "Schema";
  models: ModelNode[];
}

export interface ModelNode extends AstNode {
  kind: "Model";
  name: string;
  fields: FieldNode[];
}

export enum RelationEnum {
  ONE_TO_MANY = "one_to_many",
  MANY_TO_ONE = "many_to_one",
  ONE_TO_ONE = "one_to_one",
}

export interface FieldNode extends AstNode {
  kind: "Field";
  name: string;
  fieldType: "int" | "string" | string;
  isArray?: boolean;
  relation?: {
    type: RelationEnum;
    foreignKey?: string;
  };
}
