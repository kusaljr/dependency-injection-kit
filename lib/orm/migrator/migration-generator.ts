import { ModelNode, SchemaNode } from "../core/ast";

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
      const currModel = curr.models.find((m) => m.name === prevModel.name);
      if (!currModel) {
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
        const columnSql = this.generateColumnDefinition(field);
        stmts.push(`ALTER TABLE ${currModel.name} ADD COLUMN ${columnSql};`);
      }
    }

    for (const prevField of prevModel.fields) {
      if (!this.isRealColumn(prevField)) continue;

      const currField = currModel.fields.find((f) => f.name === prevField.name);
      if (!currField) {
        stmts.push(
          `ALTER TABLE ${currModel.name} DROP COLUMN ${prevField.name};`
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
      if (field.relation && field.relation.foreignKey) {
        constraints.push(
          `FOREIGN KEY (${field.relation.foreignKey}) REFERENCES ${field.fieldType}(id)`
        );
      }
    });

    const allParts = [...columns, ...constraints];
    return `CREATE TABLE ${model.name} (\n  ${allParts.join(",\n  ")}\n);`;
  }

  private generateColumnDefinition(field: ModelNode["fields"][0]): string {
    const sqlType = this.mapFieldTypeToSql(field.fieldType);
    if (!sqlType) {
      throw new Error(`No SQL type for field type ${field.fieldType}`);
    }

    let colDef = `${field.name} ${sqlType}`;

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
            colDef += " PRIMARY KEY AUTO_INCREMENT";
            break;
          case "sqlite":
            colDef += " PRIMARY KEY AUTOINCREMENT";
            break;
          default:
            colDef += " PRIMARY KEY";
        }
      } else {
        colDef += " PRIMARY KEY";
      }
    }

    if (field.isUnique) {
      colDef += " UNIQUE";
    }

    if (field.defaultValue !== undefined) {
      if (
        typeof field.defaultValue === "object" &&
        field.defaultValue.kind === "FunctionCall"
      ) {
        const func = field.defaultValue.name;
        colDef += this.handleDefaultFunction(func);
      } else {
        const val =
          typeof field.defaultValue === "string"
            ? `'${field.defaultValue}'`
            : field.defaultValue;
        colDef += ` DEFAULT ${val}`;
      }
    }

    if (
      field.isRequired ||
      (field.isPrimaryKey && !colDef.includes("SERIAL"))
    ) {
      colDef += " NOT NULL";
    }

    return colDef;
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
    const typeMapping = TYPE_MAPPINGS[fieldType];
    if (typeMapping) {
      return typeMapping[this.dialect] || typeMapping["generic"];
    }
    return undefined;
  }

  private isRealColumn(field: ModelNode["fields"][0]): boolean {
    return (
      TYPE_MAPPINGS[field.fieldType] !== undefined &&
      (!field.relation || field.relation.foreignKey !== undefined)
    );
  }
}
