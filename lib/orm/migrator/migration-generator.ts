import { EnumNode, FieldNode, ModelNode, SchemaNode } from "../core/ast";

export type DbDialect = "postgresql" | "mysql" | "sqlite" | "generic";

const TYPE_MAPPINGS: Record<string, Record<DbDialect, string>> = {
  int: {
    postgresql: "INTEGER",
    mysql: "INT",
    sqlite: "INTEGER",
    generic: "INTEGER",
  },
  string: {
    postgresql: "VARCHAR(255)",
    mysql: "VARCHAR(255)",
    sqlite: "TEXT",
    generic: "VARCHAR(255)",
  },
  float: {
    postgresql: "REAL",
    mysql: "FLOAT",
    sqlite: "REAL",
    generic: "FLOAT",
  },
  boolean: {
    postgresql: "BOOLEAN",
    mysql: "TINYINT(1)",
    sqlite: "BOOLEAN",
    generic: "BOOLEAN",
  },
  json: {
    postgresql: "JSONB",
    mysql: "JSON",
    sqlite: "TEXT",
    generic: "TEXT",
  },
  date: {
    postgresql: "DATE",
    mysql: "DATE",
    sqlite: "DATE",
    generic: "DATE",
  },
  datetime: {
    postgresql: "TIMESTAMP",
    mysql: "DATETIME",
    sqlite: "DATETIME",
    generic: "DATETIME",
  },
};

export class SqlGenerator {
  private ast: SchemaNode;
  private dialect: DbDialect;

  constructor(ast: SchemaNode, dialect: DbDialect = "generic") {
    this.ast = ast;
    this.dialect = dialect;
  }

  public generateMigration(previousSchema: SchemaNode | null): string {
    const statements: string[] = [];

    if (!previousSchema) {
      // 1. Create enum types
      if (this.ast.enums) {
        this.ast.enums.forEach((enumNode) => {
          statements.push(this.generateCreateEnum(enumNode));
        });
      }

      // 2. Sort tables by dependency order
      const orderedModels = this.sortModelsByDependencies(this.ast.models);

      // 3. Create standard tables
      orderedModels.forEach((model) => {
        statements.push(this.generateCreateTable(model));
      });

      // 4. Create Many-to-Many Join Tables
      statements.push(...this.generateJoinTables(this.ast.models));
    } else {
      // Handle enum changes
      statements.push(
        ...this.generateEnumMigrationStatements(previousSchema, this.ast)
      );
      statements.push(
        ...this.generateMigrationStatements(previousSchema, this.ast)
      );
    }

    if (statements.length === 0) {
      return "-- No changes detected.";
    }

    console.log("🛠 Generated migration statements:");
    statements.forEach((stmt) => console.log(stmt));

    return `BEGIN;\n${statements.join("\n")}\nCOMMIT;`;
  }

  private generateEnumMigrationStatements(
    prev: SchemaNode,
    curr: SchemaNode
  ): string[] {
    const stmts: string[] = [];
    const prevEnums = prev.enums ?? [];
    const currEnums = curr.enums ?? [];

    for (const currEnum of currEnums) {
      const prevEnum = prevEnums.find((e) => e.name === currEnum.name);
      if (!prevEnum) {
        stmts.push(this.generateCreateEnum(currEnum));
      } else {
        const newValues = currEnum.values.filter(
          (v) => !prevEnum.values.includes(v)
        );
        newValues.forEach((val) => {
          stmts.push(
            `ALTER TYPE ${this.quote(currEnum.name)} ADD VALUE '${val}';`
          );
        });
      }
    }

    return stmts;
  }

  private generateCreateEnum(enumNode: EnumNode): string {
    const values = enumNode.values.map((v) => `'${v}'`).join(", ");
    return `CREATE TYPE ${this.quote(enumNode.name)} AS ENUM (${values});`;
  }

  /**
   * Generates join tables for many-to-many relationships.
   * Handles deduplication so we don't create the table twice.
   */
  private generateJoinTables(models: ModelNode[]): string[] {
    const statements: string[] = [];
    const processedPairs = new Set<string>();

    for (const model of models) {
      for (const field of model.fields) {
        if (field.relation?.type === "many_to_many") {
          const modelA = model.name;
          const modelB = field.fieldType; // The target model name

          // Sort to create a unique key for this pair (e.g., "Post_User")
          // This prevents processing "User -> Post" and "Post -> User" separately.
          const sortedNames = [modelA, modelB].sort();
          const pairKey = sortedNames.join("_");

          if (processedPairs.has(pairKey)) {
            continue;
          }
          processedPairs.add(pairKey);

          // Determine Join Table Name
          // Use explicit name if provided in @many_to_many("Name"), else generic
          const tableName = field.relation.foreignKey || `_${pairKey}`;

          statements.push(
            this.createJoinTableSql(tableName, sortedNames[0], sortedNames[1])
          );
        }
      }
    }
    return statements;
  }

  private createJoinTableSql(
    tableName: string,
    modelA: string,
    modelB: string
  ): string {
    const pkA = this.getPrimaryKeyField(modelA);
    const pkB = this.getPrimaryKeyField(modelB);

    if (!pkA || !pkB) {
      throw new Error(
        `Cannot create M:N relation for ${modelA}-${modelB}: Both models must have a Primary Key.`
      );
    }

    const typeA = this.mapFieldTypeToSql(pkA.fieldType);
    const typeB = this.mapFieldTypeToSql(pkB.fieldType);

    // Remove SERIAL/AUTO_INCREMENT logic from types, we just want the raw type (e.g., INTEGER)
    const rawTypeA = this.sanitizeTypeForForeignKey(typeA!);
    const rawTypeB = this.sanitizeTypeForForeignKey(typeB!);

    // Naming convention: "A_id", "B_id"
    const colA = `${"A"}_${pkA.name}`;
    const colB = `${"B"}_${pkB.name}`;

    return `CREATE TABLE ${this.quote(tableName)} (
  ${this.quote(colA)} ${rawTypeA} NOT NULL,
  ${this.quote(colB)} ${rawTypeB} NOT NULL,
  FOREIGN KEY (${this.quote(colA)}) REFERENCES ${this.quote(modelA)}(${this.quote(pkA.name)}) ON DELETE CASCADE,
  FOREIGN KEY (${this.quote(colB)}) REFERENCES ${this.quote(modelB)}(${this.quote(pkB.name)}) ON DELETE CASCADE,
  UNIQUE (${this.quote(colA)}, ${this.quote(colB)})
);`;
  }

  private getPrimaryKeyField(modelName: string): FieldNode | undefined {
    const model = this.ast.models.find((m) => m.name === modelName);
    return model?.fields.find((f) => f.isPrimaryKey);
  }

  private sanitizeTypeForForeignKey(sqlType: string): string {
    // If the PK is SERIAL (Postgres), the FK should be INTEGER.
    // If PK is INT AUTO_INCREMENT (MySQL), FK should be INT.
    if (sqlType.includes("SERIAL")) return "INTEGER";
    return sqlType
      .replace("AUTO_INCREMENT", "")
      .replace("AUTOINCREMENT", "")
      .trim();
  }

  // ... (Keep sortModelsByDependencies, generateMigrationStatements, generateAlterTable, etc.) ...

  private sortModelsByDependencies(models: ModelNode[]): ModelNode[] {
    const graph = new Map<string, Set<string>>();
    for (const model of models) {
      const deps = new Set<string>();
      for (const field of model.fields) {
        // Only consider actual FK columns (Many-to-One), ignore M:N for sorting
        if (field.relation && field.relation.type !== "many_to_many") {
          const fkTarget = field.relation.foreignKey ? field.fieldType : null;
          if (fkTarget) deps.add(fkTarget);
        }
      }
      graph.set(model.name, deps);
    }

    // ... (Rest of topological sort logic remains the same)
    // Topological sort
    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (name: string, stack: Set<string>) => {
      if (visited.has(name)) return;
      if (stack.has(name)) {
        console.warn(`⚠️ Circular reference detected involving ${name}`);
        return;
      }
      stack.add(name);
      for (const dep of graph.get(name) || []) {
        if (graph.has(dep)) visit(dep, stack);
      }
      stack.delete(name);
      visited.add(name);
      sorted.push(name);
    };

    for (const name of graph.keys()) {
      visit(name, new Set());
    }

    return sorted.map((n) => models.find((m) => m.name === n)!);
  }

  // ... (Keep generateMigrationStatements, generateAlterTable, generateColumnAlterStatements) ...

  // (Paste generateMigrationStatements, generateAlterTable, generateColumnAlterStatements here unchanged)
  private generateMigrationStatements(
    prev: SchemaNode,
    curr: SchemaNode
  ): string[] {
    const stmts: string[] = [];

    const orderedModels = this.sortModelsByDependencies(curr.models);

    for (const model of orderedModels) {
      const prevModel = prev.models.find((m) => m.name === model.name);
      if (!prevModel) {
        stmts.push(this.generateCreateTable(model));
      } else {
        stmts.push(...this.generateAlterTable(prevModel, model));
      }
    }

    for (const prevModel of prev.models) {
      if (!curr.models.find((m) => m.name === prevModel.name)) {
        stmts.push(`DROP TABLE ${this.quote(prevModel.name)} CASCADE;`);
      }
    }

    return stmts;
  }

  private generateAlterTable(
    prevModel: ModelNode,
    currModel: ModelNode
  ): string[] {
    const stmts: string[] = [];

    for (const field of currModel.fields) {
      if (!this.isRealColumn(field)) continue;

      const prevField = prevModel.fields.find((f) => f.name === field.name);
      if (!prevField) {
        const colSql = this.generateColumnDefinition(field);
        stmts.push(`ALTER TABLE ${this.quote(currModel.name)} ADD COLUMN ${colSql};`);
      } else {
        stmts.push(
          ...this.generateColumnAlterStatements(
            currModel.name,
            prevField,
            field
          )
        );
      }
    }

    for (const prevField of prevModel.fields) {
      if (!this.isRealColumn(prevField)) continue;
      if (!currModel.fields.find((f) => f.name === prevField.name)) {
        stmts.push(
          `ALTER TABLE ${this.quote(currModel.name)} DROP COLUMN ${this.quote(prevField.name)};`
        );
      }
    }

    return stmts;
  }

  private generateColumnAlterStatements(
    tableName: string,
    prevField: FieldNode,
    currField: FieldNode
  ): string[] {
    const stmts: string[] = [];

    // Nullability change, protect PK
    if (prevField.isRequired !== currField.isRequired) {
      if (currField.isRequired) {
        stmts.push(
          `ALTER TABLE ${this.quote(tableName)} ALTER COLUMN ${this.quote(currField.name)} SET NOT NULL;`
        );
      } else {
        if (prevField.isPrimaryKey) {
          stmts.push(
            `-- WARNING: Attempt to DROP NOT NULL on primary key column ${this.quote(currField.name)} skipped.`
          );
        } else {
          stmts.push(
            `ALTER TABLE ${this.quote(tableName)} ALTER COLUMN ${this.quote(currField.name)} DROP NOT NULL;`
          );
        }
      }
    }

    // Default value change
    if (
      JSON.stringify(prevField.defaultValue) !==
      JSON.stringify(currField.defaultValue)
    ) {
      if (currField.defaultValue === undefined) {
        stmts.push(
          `ALTER TABLE ${this.quote(tableName)} ALTER COLUMN ${this.quote(currField.name)} DROP DEFAULT;`
        );
      } else {
        let defaultVal = "";
        if (
          typeof currField.defaultValue === "object" &&
          currField.defaultValue.kind === "FunctionCall"
        ) {
          defaultVal = this.handleDefaultFunction(
            currField.defaultValue.name
          ).replace(/^ DEFAULT /, "");
        } else {
          defaultVal =
            typeof currField.defaultValue === "string"
              ? `'${currField.defaultValue}'`
              : String(currField.defaultValue);
        }
        stmts.push(
          `ALTER TABLE ${this.quote(tableName)} ALTER COLUMN ${this.quote(currField.name)} SET DEFAULT ${defaultVal};`
        );
      }
    }

    // Type change
    if (currField.fieldType !== prevField.fieldType) {
      let sqlType: string | undefined;
      if (currField.enumValues !== undefined) {
        sqlType = currField.fieldType;
      } else {
        sqlType = this.mapFieldTypeToSql(currField.fieldType);
      }
      if (sqlType) {
        let alter = `ALTER TABLE ${this.quote(tableName)} ALTER COLUMN ${this.quote(currField.name)} TYPE ${sqlType}`;
        if (this.dialect === "postgresql" && currField.fieldType === "json") {
          alter += ` USING ${currField.name}::${sqlType}`;
        } else if (
          this.dialect === "postgresql" &&
          currField.enumValues !== undefined
        ) {
          alter += ` USING ${currField.name}::${this.quote(currField.fieldType)}`;
        }
        alter += ";";
        stmts.push(alter);
      }
    }

    // Unique constraint change
    if (prevField.isUnique !== currField.isUnique) {
      if (currField.isUnique) {
        stmts.push(`ALTER TABLE ${this.quote(tableName)} ADD UNIQUE (${this.quote(currField.name)});`);
      } else {
        stmts.push(
          `-- WARNING: UNIQUE constraint removal for ${currField.name} not automated.`
        );
      }
    }

    return stmts;
  }

  private generateCreateTable(model: ModelNode): string {
    const columns: string[] = [];
    const constraints: string[] = [];

    model.fields.forEach((field) => {
      if (this.isRealColumn(field)) {
        columns.push(this.generateColumnDefinition(field));
      }
    });

    if (model.combinedUniques) {
      model.combinedUniques.forEach((fields) => {
        constraints.push(`UNIQUE (${fields.map((f) => this.quote(f)).join(", ")})`);
      });
    }

    model.fields.forEach((field) => {
      // Logic update: Only generate standard FK constraints for One-to-Many or One-to-One
      // Many-to-Many uses a separate table, handled in generateJoinTables
      if (
        field.relation?.foreignKey &&
        field.relation.type !== "many_to_many"
      ) {
        constraints.push(
          `FOREIGN KEY (${this.quote(field.relation.foreignKey)}) REFERENCES ${this.quote(field.fieldType)}(${this.quote("id")})`
        );
      }
    });

    return `CREATE TABLE ${this.quote(model.name)} (\n  ${[...columns, ...constraints].join(
      ",\n  "
    )}\n);`;
  }

  private generateColumnDefinition(field: FieldNode): string {
    let sqlType: string | undefined;

    if (field.enumValues !== undefined) {
      sqlType = field.fieldType;
    } else {
      sqlType = this.mapFieldTypeToSql(field.fieldType);
    }

    if (!sqlType) throw new Error(`No SQL type for ${field.fieldType}`);

    // Handle json arrays
    if (field.fieldType === "json" && field.jsonTypeDefinition?.isArray) {
      switch (this.dialect) {
        case "postgresql":
          sqlType = "JSONB";
          break;
        case "mysql":
          sqlType = "JSON";
          break;
        case "sqlite":
          sqlType = "TEXT";
          break;
        default:
          sqlType = "TEXT";
      }
    }

    let col = `${this.quote(field.name)} ${sqlType}`;

    if (field.isPrimaryKey) {
      if (
        typeof field.defaultValue === "object" &&
        field.defaultValue.kind === "FunctionCall" &&
        field.defaultValue.name === "autoincrement"
      ) {
        switch (this.dialect) {
          case "postgresql":
            return `${field.name} SERIAL PRIMARY KEY`;
          case "mysql":
            col += " PRIMARY KEY AUTO_INCREMENT";
            break;
          case "sqlite":
            col += " PRIMARY KEY AUTOINCREMENT";
            break;
          default:
            col += " PRIMARY KEY";
        }
      } else {
        col += " PRIMARY KEY";
      }
    }

    if (field.isUnique) col += " UNIQUE";

    if (field.defaultValue !== undefined) {
      if (
        typeof field.defaultValue === "object" &&
        field.defaultValue.kind === "FunctionCall"
      ) {
        col += this.handleDefaultFunction(field.defaultValue.name);
      } else {
        const val =
          typeof field.defaultValue === "string"
            ? `'${field.defaultValue}'`
            : field.defaultValue;
        col += ` DEFAULT ${val}`;
      }
    }

    if (field.isRequired || (field.isPrimaryKey && !col.includes("SERIAL"))) {
      col += " NOT NULL";
    }

    return col;
  }

  private handleDefaultFunction(func: string): string {
    switch (func) {
      case "now":
        switch (this.dialect) {
          case "postgresql":
            return " DEFAULT CURRENT_TIMESTAMP";
          case "mysql":
            return " DEFAULT NOW()";
          case "sqlite":
            return " DEFAULT (DATETIME('now'))";
          default:
            return " DEFAULT 'now_placeholder'";
        }
      case "uuid":
        switch (this.dialect) {
          case "postgresql":
            return " DEFAULT gen_random_uuid()";
          case "mysql":
            return " DEFAULT (UUID())";
          case "sqlite":
            return " DEFAULT (HEX(RANDOMBLOB(16)))";
          default:
            return " DEFAULT 'uuid_placeholder'";
        }
      default:
        return "";
    }
  }

  private mapFieldTypeToSql(fieldType: string): string | undefined {
    const mapping = TYPE_MAPPINGS[fieldType];
    if (mapping) return mapping[this.dialect] || mapping.generic;
    // Check if fieldType is an enum type name defined in the schema
    if (this.ast.enums?.some((e) => e.name === fieldType)) {
      return fieldType;
    }
    return undefined;
  }

  private isRealColumn(field: FieldNode): boolean {
    if (field.relation?.type === "many_to_many") return false;
    if (field.enumValues !== undefined) return true;
    return TYPE_MAPPINGS[field.fieldType] !== undefined;
  }

  private quote(id: string): string {
    return `"${id}"`;
  }
}
