import { SQL } from "bun";
import { FieldNode, ModelNode, RelationEnum, SchemaNode } from "../core/ast";
export async function fetchSchemaAstFromDb(sql: SQL): Promise<SchemaNode> {
  // Fetch columns
  const columns = await sql`
    SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
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

    const { type, isArray } = mapPgTypeToFieldType(col.data_type, col.udt_name);

    const field: FieldNode = {
      kind: "Field",
      name: col.column_name,
      fieldType: type,
      isArray,
      isPrimaryKey: false, // Will be set via constraints
      isRequired: col.is_nullable === "NO",
      isUnique: false,
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

  // Handle autoincrement serial (nextval('some_sequence'::regclass))
  if (/^nextval\('.*_seq'::regclass\)/.test(defVal)) {
    return { kind: "FunctionCall", name: "autoincrement" };
  }

  if (defVal === "true" || defVal === "false") {
    return defVal === "true";
  }

  if (!isNaN(Number(defVal))) {
    return Number(defVal);
  }

  const strMatch = defVal.match(/^'(.*)'::/);
  if (strMatch) return strMatch[1];

  if (defVal.startsWith("now()")) {
    return { kind: "FunctionCall", name: "now" };
  }

  return defVal;
}

function mapPgTypeToFieldType(
  pgType: string,
  udtName: string
): { type: string; isArray: boolean } {
  const base: Record<string, string> = {
    int4: "int",
    integer: "int",
    varchar: "string",
    "character varying": "string",
    text: "string",
    bool: "boolean",
    boolean: "boolean",
    real: "float",
    float4: "float",
    json: "json",
    jsonb: "json",
    timestamp: "datetime",
    "timestamp without time zone": "datetime",
    "timestamp with time zone": "datetime",
    date: "date",
  };

  if (pgType === "ARRAY" && udtName.startsWith("_")) {
    const inner = udtName.slice(1);
    return { type: base[inner] || "string", isArray: true };
  }

  return { type: base[pgType] || "string", isArray: false };
}
