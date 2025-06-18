export interface AstNode {
  kind: string;
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

export interface FieldNode extends AstNode {
  kind: "Field";
  name: string;
  fieldType: "int" | "string";
}
