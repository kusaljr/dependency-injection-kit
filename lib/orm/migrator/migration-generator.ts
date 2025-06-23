import { FieldNode, ModelNode, SchemaNode } from "../core/ast";

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
      this.ast.models.forEach((model) => {
        statements.push(this.generateCreateTable(model));
      });
    } else {
      statements.push(
        ...this.generateMigrationStatements(previousSchema, this.ast)
      );
    }

    if (statements.length === 0) {
      return "-- No changes detected.";
    }

    return `BEGIN;\n${statements.join("\n")}\nCOMMIT;`;
  }

  private generateMigrationStatements(
    prev: SchemaNode,
    curr: SchemaNode
  ): string[] {
    const stmts: string[] = [];

    for (const model of curr.models) {
      const prevModel = prev.models.find((m) => m.name === model.name);
      if (!prevModel) {
        stmts.push(this.generateCreateTable(model));
      } else {
        stmts.push(...this.generateAlterTable(prevModel, model));
      }
    }

    for (const prevModel of prev.models) {
      if (!curr.models.find((m) => m.name === prevModel.name)) {
        stmts.push(`DROP TABLE ${prevModel.name};`);
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
        stmts.push(`ALTER TABLE ${currModel.name} ADD COLUMN ${colSql};`);
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
          `ALTER TABLE ${currModel.name} DROP COLUMN ${prevField.name};`
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
          `ALTER TABLE ${tableName} ALTER COLUMN ${currField.name} SET NOT NULL;`
        );
      } else {
        if (prevField.isPrimaryKey) {
          stmts.push(
            `-- WARNING: Attempt to DROP NOT NULL on primary key column ${currField.name} skipped.`
          );
        } else {
          stmts.push(
            `ALTER TABLE ${tableName} ALTER COLUMN ${currField.name} DROP NOT NULL;`
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
          `ALTER TABLE ${tableName} ALTER COLUMN ${currField.name} DROP DEFAULT;`
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
          `ALTER TABLE ${tableName} ALTER COLUMN ${currField.name} SET DEFAULT ${defaultVal};`
        );
      }
    }

    if (currField.fieldType !== prevField.fieldType) {
      const sqlType = this.mapFieldTypeToSql(currField.fieldType);
      if (sqlType) {
        let alter = `ALTER TABLE ${tableName} ALTER COLUMN ${currField.name} TYPE ${sqlType}`;
        if (this.dialect === "postgresql" && currField.fieldType === "json") {
          alter += ` USING ${currField.name}::${sqlType}`;
        }
        alter += ";";
        stmts.push(alter);
      }
    }

    // Unique change (single column)
    if (prevField.isUnique !== currField.isUnique) {
      if (currField.isUnique) {
        stmts.push(`ALTER TABLE ${tableName} ADD UNIQUE (${currField.name});`);
      } else {
        stmts.push(
          `-- WARNING: UNIQUE constraint removal for ${currField.name} not automated. Please drop constraint manually if needed.`
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
        constraints.push(`UNIQUE (${fields.join(", ")})`);
      });
    }

    model.fields.forEach((field) => {
      if (field.relation?.foreignKey) {
        constraints.push(
          `FOREIGN KEY (${field.relation.foreignKey}) REFERENCES ${field.fieldType}(id)`
        );
      }
    });

    return `CREATE TABLE ${model.name} (\n  ${[...columns, ...constraints].join(
      ",\n  "
    )}\n);`;
  }

  private generateColumnDefinition(field: FieldNode): string {
    let sqlType = this.mapFieldTypeToSql(field.fieldType);
    if (!sqlType) throw new Error(`No SQL type for ${field.fieldType}`);

    // Handle json[]
    if (field.fieldType === "json" && field.jsonTypeDefinition?.isArray) {
      // Instead of making a PostgreSQL jsonb[] array, just keep as jsonb
      switch (this.dialect) {
        case "postgresql":
          // Override to plain JSONB (no array)
          sqlType = "JSONB";
          break;
        case "mysql":
          // MySQL stores JSON as JSON type anyway, no array support
          sqlType = "JSON";
          break;
        case "sqlite":
          // SQLite uses TEXT for JSON
          sqlType = "TEXT";
          break;
        default:
          sqlType = "TEXT";
      }
    }

    let col = `${field.name} ${sqlType}`;

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
    return mapping ? mapping[this.dialect] || mapping.generic : undefined;
  }

  private isRealColumn(field: FieldNode): boolean {
    return TYPE_MAPPINGS[field.fieldType] !== undefined;
  }
}
