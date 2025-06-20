import { SQL } from "bun";
import { FieldNode, ModelNode, RelationEnum, SchemaNode } from "../core/ast";
export async function fetchSchemaAstFromDb(sql: SQL): Promise<SchemaNode> {
  // Fetch columns
  const columns = await sql`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position;
  `;

  // Fetch constraints
  const constraints = await sql`
    SELECT
      con.conname,
      con.contype,
      conrelid::regclass::text AS table_name,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    WHERE con.connamespace = 'public'::regnamespace;
  `;

  // Fetch foreign keys separately for clarity
  const fks = constraints.filter((c: any) => c.contype === "f");

  const modelsMap: Record<string, ModelNode> = {};

  // Process columns
  columns.forEach((col: any) => {
    if (!modelsMap[col.table_name]) {
      modelsMap[col.table_name] = {
        kind: "Model",
        name: col.table_name,
        fields: [],
        combinedUniques: [],
        line: 0,
        column: 0,
      };
    }

    const field: FieldNode = {
      kind: "Field",
      name: col.column_name,
      fieldType: mapPgTypeToFieldType(col.data_type),
      isArray: false,
      isPrimaryKey: false, // Will fill later
      isRequired: col.is_nullable === "NO",
      isUnique: false, // Will fill later
      defaultValue: parsePgDefault(col.column_default),
      line: 0,
      column: 0,
    };

    modelsMap[col.table_name].fields.push(field);
  });

  // Process constraints
  constraints.forEach((c: any) => {
    const model = modelsMap[c.table_name];
    if (!model) return;

    if (c.contype === "p") {
      // Primary key
      const cols = extractCols(c.definition);
      model.fields.forEach((f) => {
        if (cols.includes(f.name)) f.isPrimaryKey = true;
      });
    } else if (c.contype === "u") {
      // Unique constraint
      const cols = extractCols(c.definition);
      if (cols.length === 1) {
        model.fields.forEach((f) => {
          if (cols[0] === f.name) f.isUnique = true;
        });
      } else {
        model.combinedUniques!.push(cols);
      }
    } else if (c.contype === "f") {
      // Foreign key
      const cols = extractCols(c.definition);
      const refMatch = c.definition.match(/REFERENCES\s+(\w+)\s*\(([^)]+)\)/);
      if (!refMatch) return;
      const refTable = refMatch[1];
      const refCols = refMatch[2].split(",").map((s: string) => s.trim());

      cols.forEach((colName, i) => {
        const field = model.fields.find((f) => f.name === colName);
        if (field) {
          field.relation = {
            type: RelationEnum.MANY_TO_ONE,
            foreignKey: colName,
          };
        }

        // Optionally, create a virtual field for the related model
        if (!model.fields.find((f) => f.name === refTable)) {
          model.fields.push({
            kind: "Field",
            name: refTable,
            fieldType: refTable,
            isArray: false,
            isPrimaryKey: false,
            isRequired: false,
            isUnique: false,
            relation: {
              type: RelationEnum.MANY_TO_ONE,
              foreignKey: colName,
            },
            line: 0,
            column: 0,
          });
        }
      });
    }
  });

  return {
    kind: "Schema",
    models: Object.values(modelsMap),
    line: 0,
    column: 0,
  };
}

function extractCols(definition: string): string[] {
  const match = definition.match(/\(([^)]+)\)/);
  if (!match) return [];
  return match[1].split(",").map((s) => s.trim());
}

function parsePgDefault(defVal: string | null): any {
  if (!defVal) return undefined;

  // Handle autoincrement serial
  if (defVal.includes("nextval")) {
    return { kind: "FunctionCall", name: "autoincrement" };
  }

  // Handle now()
  if (defVal.startsWith("now()")) {
    return { kind: "FunctionCall", name: "now" };
  }

  // Handle true/false
  if (defVal === "true" || defVal === "false") {
    return defVal === "true";
  }

  // Handle numeric
  if (!isNaN(Number(defVal))) {
    return Number(defVal);
  }

  // Handle string literal
  const strMatch = defVal.match(/^'(.*)'::/);
  if (strMatch) return strMatch[1];

  return defVal;
}

function mapPgTypeToFieldType(pgType: string): string {
  switch (pgType) {
    case "integer":
      return "int";
    case "character varying":
      return "string";
    case "text":
      return "string";
    case "boolean":
      return "boolean";
    case "real":
      return "float";
    case "jsonb":
    case "json":
      return "json";
    case "timestamp without time zone":
    case "timestamp with time zone":
      return "datetime";
    case "date":
      return "date";
    default:
      return "string";
  }
}
