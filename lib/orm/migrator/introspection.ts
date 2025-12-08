import { SQL } from "bun";
import { FieldNode, ModelNode, RelationEnum, SchemaNode } from "../core/ast";

export async function fetchSchemaAstFromDb(sql: SQL): Promise<SchemaNode> {
  // 1. Fetch columns
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

  // 2. Fetch constraints
  const constraints = await sql`
    SELECT
      con.conname,
      con.contype,
      conrelid::regclass::text AS table_name,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    WHERE con.connamespace = 'public'::regnamespace;
  `;

  const modelsMap: Record<string, ModelNode> = {};

  // 3. Process columns to build initial Model nodes
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

  // 4. Process constraints to identify PKs and FKs
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

      cols.forEach((colName) => {
        const field = model.fields.find((f) => f.name === colName);
        if (field) {
          // Mark the column as a relation holder
          field.relation = {
            type: RelationEnum.MANY_TO_ONE, // Default assumption
            foreignKey: colName,
          };
          // Store the target model name temporarily in fieldType or a metadata property
          // so we can resolve it later.
          // NOTE: We change fieldType to the Model name for relation clarity in AST
          field.fieldType = refTable;
        }
      });
    }
  });

  // 5. Post-Processing: Detect and Transform Many-to-Many Join Tables
  // We iterate through all models to find "Join Table" candidates.
  const modelNames = Object.keys(modelsMap);
  const modelsToRemove: string[] = [];

  for (const name of modelNames) {
    const model = modelsMap[name];

    // Filter fields to find Foreign Keys
    const fkFields = model.fields.filter(
      (f) => f.relation?.type === RelationEnum.MANY_TO_ONE
    );

    // Check heuristic:
    // 1. Exactly 2 Foreign Keys.
    // 2. No other "data" columns. (We allow PKs and standard timestamps if they exist, but pure join tables usually don't have extra string/int data fields).
    // 3. (Optional) Naming convention check (starts with _)
    const nonFkFields = model.fields.filter(
      (f) =>
        !f.relation &&
        !f.isPrimaryKey &&
        f.name !== "created_at" &&
        f.name !== "updated_at"
    );

    if (fkFields.length === 2 && nonFkFields.length === 0) {
      // This is likely a Join Table (e.g., _PostToTag, UserGroups)
      const fieldA = fkFields[0];
      const fieldB = fkFields[1];

      const modelAName = fieldA.fieldType; // The target table A
      const modelBName = fieldB.fieldType; // The target table B

      const modelA = modelsMap[modelAName];
      const modelB = modelsMap[modelBName];

      if (modelA && modelB) {
        // Create Many-to-Many field on Model A
        modelA.fields.push({
          kind: "Field",
          name: pluralize(modelB.name).toLowerCase(), // e.g., "tags"
          fieldType: modelB.name,
          isArray: true, // M:N is always an array
          isPrimaryKey: false,
          isRequired: false,
          isUnique: false,
          relation: {
            type: RelationEnum.MANY_TO_MANY,
            foreignKey: model.name, // We store the Join Table Name here for reference
          },
          line: 0,
          column: 0,
        });

        // Create Many-to-Many field on Model B
        modelB.fields.push({
          kind: "Field",
          name: pluralize(modelA.name).toLowerCase(), // e.g., "posts"
          fieldType: modelA.name,
          isArray: true,
          isPrimaryKey: false,
          isRequired: false,
          isUnique: false,
          relation: {
            type: RelationEnum.MANY_TO_MANY,
            foreignKey: model.name,
          },
          line: 0,
          column: 0,
        });

        // Mark this join table for removal from the final AST
        modelsToRemove.push(name);
      }
    }
  }

  // Remove the join tables
  const finalModels = Object.values(modelsMap).filter(
    (m) => !modelsToRemove.includes(m.name)
  );

  return {
    kind: "Schema",
    models: finalModels,
    line: 0,
    column: 0,
  };
}

// --- Helpers ---

function extractCols(definition: string): string[] {
  const match = definition.match(/\(([^)]+)\)/);
  if (!match) return [];
  // Handle quoted identifiers and whitespace
  return match[1].split(",").map((s) => s.trim().replace(/"/g, ""));
}

function pluralize(word: string): string {
  if (word.endsWith("y")) return word.slice(0, -1) + "ies";
  if (word.endsWith("s")) return word;
  return word + "s";
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

  if (defVal.startsWith("now()") || defVal === "CURRENT_TIMESTAMP") {
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
    int8: "int",
    bigint: "int", // Mapping bigints to int for simplicity in AST
    varchar: "string",
    "character varying": "string",
    text: "string",
    bool: "boolean",
    boolean: "boolean",
    real: "float",
    float4: "float",
    float8: "float",
    double: "float",
    "double precision": "float",
    json: "json",
    jsonb: "json",
    timestamp: "datetime",
    "timestamp without time zone": "datetime",
    "timestamp with time zone": "datetime",
    date: "date",
    uuid: "string",
  };

  if (pgType === "ARRAY" && udtName.startsWith("_")) {
    const inner = udtName.slice(1);
    return { type: base[inner] || "string", isArray: true };
  }

  return { type: base[pgType] || "string", isArray: false };
}
