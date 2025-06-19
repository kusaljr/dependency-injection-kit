type AST = {
  kind: "Schema";
  models: {
    kind: "Model";
    name: string;
    fields: {
      kind: "Field";
      name: string;
      fieldType: "int" | "string";
    }[];
  }[];
};

export function generateTypeCode(ast: AST): string {
  const modelEntries = ast.models
    .map((model) => {
      const fields = model.fields
        .map((field) => {
          const tsType = field.fieldType === "int" ? "number" : "string";
          return `    ${field.name}: ${tsType};`;
        })
        .join("\n");

      return `  ${model.name}: {\n${fields}\n  };`;
    })
    .join("\n");

  return `// AUTO-GENERATED FILE. DO NOT EDIT.

export type Models = {
${modelEntries}
};

export type ModelNames = keyof Models;
export type FieldsOf<M extends ModelNames> = keyof Models[M];
`.trim();
}
