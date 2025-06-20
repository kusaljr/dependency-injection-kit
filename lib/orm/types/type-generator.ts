type AST = {
  kind: "Schema";
  models: {
    kind: "Model";
    name: string;
    fields: {
      kind: "Field";
      name: string;
      fieldType: "int" | "string" | string; // string for model ref
      isArray?: boolean;
    }[];
  }[];
};

export function generateTypeCode(ast: AST): string {
  const modelNames = ast.models.map((m) => `"${m.name}"`).join(" | ");

  const modelTypes = ast.models
    .map((model) => {
      const fields = model.fields
        .map((field) => {
          const tsType = mapFieldType(field);
          return `  ${field.name}: ${tsType};`;
        })
        .join("\n");
      return `export type ${model.name} = {\n${fields}\n};`;
    })
    .join("\n\n");

  const modelsMapping = `export type Models = {\n${ast.models
    .map((m) => `  ${m.name}: ${m.name};`)
    .join("\n")}\n};`;

  return `// AUTO-GENERATED FILE. DO NOT EDIT.

${modelTypes}

export type ModelNames = ${modelNames};

${modelsMapping}
`.trim();
}

function mapFieldType(field: AST["models"][0]["fields"][0]): string {
  if (field.fieldType === "int" || field.fieldType === "float") return "number";
  if (
    field.fieldType === "string" ||
    field.fieldType === "date" ||
    field.fieldType === "datetime"
  )
    return "string";
  return field.isArray ? `${field.fieldType}[]` : field.fieldType;
}
