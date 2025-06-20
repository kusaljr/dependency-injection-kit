import { SchemaNode } from "../core/ast";

export function generateTypeCode(ast: SchemaNode): string {
  const modelNames = ast.models.map((m) => `"${m.name}"`).join(" | ");

  const modelTypes = ast.models
    .map((model) => {
      const fields = model.fields
        .map((field) => {
          const tsType = mapFieldType(field);
          return `  ${field.name}${field.isRequired ? "" : "?"} : ${tsType};`;
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

function mapFieldType(field: SchemaNode["models"][0]["fields"][0]): string {
  if (field.fieldType === "int" || field.fieldType === "float") return "number";
  if (
    field.fieldType === "string" ||
    field.fieldType === "date" ||
    field.fieldType === "datetime"
  )
    return "string";
  return field.isArray ? `${field.fieldType}[]` : field.fieldType;
}
