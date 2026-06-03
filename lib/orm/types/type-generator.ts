import { SchemaNode } from "../core/ast";

export function generateTypeCode(ast: SchemaNode): string {
  const modelNames = ast.models.map((m) => `"${m.name}"`).join(" | ");

  const enumTypes = (ast.enums ?? [])
    .map(
      (enumNode) =>
        `export type ${enumNode.name} = ${enumNode.values
          .map((v) => `"${v}"`)
          .join(" | ")};`
    )
    .join("\n\n");

  const modelTypes = ast.models
    .map((model) => {
      const fields = model.fields
        .map((field) => {
          const tsType = mapFieldType(field, ast);
          return `  ${field.name}${field.isRequired ? "" : "?"} : ${tsType};`;
        })
        .join("\n");
      return `export type ${model.name} = {\n${fields}\n};`;
    })
    .join("\n\n");

  const modelsMapping = `export type Models = {\n${ast.models
    .map((m) => `  ${m.name}: ${m.name};`)
    .join("\n")}\n};`;

  const parts = ["// AUTO-GENERATED FILE. DO NOT EDIT."];
  if (enumTypes) parts.push(enumTypes);
  parts.push(modelTypes);
  parts.push(`export type ModelNames = ${modelNames};`);
  parts.push(modelsMapping);

  return parts.join("\n\n").trim();
}

function mapFieldType(
  field: SchemaNode["models"][0]["fields"][0],
  ast: SchemaNode
): string {
  if (field.enumValues !== undefined) {
    const enumType = (ast.enums ?? []).find(
      (e) => e.name === field.fieldType
    );
    if (enumType) {
      return field.isArray ? `Array<${field.fieldType}>` : field.fieldType;
    }
  }

  if (field.fieldType === "json" && field.jsonTypeDefinition?.raw) {
    let base = field.jsonTypeDefinition.raw.trim();

    if (base.startsWith("{") && base.endsWith("}")) {
      base = base.slice(1, -1).trim();
      base = `{ ${base} }`;
    }

    return field.jsonTypeDefinition.isArray ? `Array<${base}>` : base;
  }

  if (field.fieldType === "int" || field.fieldType === "float") return "number";
  if (
    field.fieldType === "string" ||
    field.fieldType === "date" ||
    field.fieldType === "datetime"
  )
    return "string";
  if (field.fieldType === "boolean") return "boolean";

  return field.isArray ? `${field.fieldType}[]` : field.fieldType;
}
