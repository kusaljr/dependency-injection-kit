import { ModelNode, SchemaNode } from "./ast";

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
};

export class SqlGenerator {
  private ast: SchemaNode;
  private dialect: DbDialect;

  constructor(ast: SchemaNode, dialect: DbDialect = "generic") {
    this.ast = ast;
    this.dialect = dialect;
  }

  public generate(): string[] {
    const statements: string[] = [];
    this.ast.models.forEach((model) => {
      statements.push(this.generateCreateTable(model));
    });
    return statements;
  }

  private generateCreateTable(model: ModelNode): string {
    const tableName = model.name;
    const columns: string[] = [];
    const constraints: string[] = [];

    model.fields.forEach((field) => {
      const columnName = field.name;

      if (["int", "string", "float"].includes(field.fieldType)) {
        const sqlType = this.mapFieldTypeToSql(field.fieldType);

        if (!sqlType) {
          console.warn(
            `Warning: Unknown type '${field.fieldType}' for field '${field.name}'. Skipping column generation.`
          );
          return;
        }

        let columnDefinition = `${columnName} ${sqlType}`;

        if (field.isPrimaryKey) {
          columnDefinition += " PRIMARY KEY";
        }

        if (field.isUnique) {
          columnDefinition += " UNIQUE";
        }

        if (field.defaultValue !== undefined) {
          const defVal =
            typeof field.defaultValue === "string"
              ? `'${field.defaultValue}'`
              : field.defaultValue;
          columnDefinition += ` DEFAULT ${defVal}`;
        }

        if (field.isPrimaryKey || field.isRequired) {
          columnDefinition += " NOT NULL";
        }

        columns.push(columnDefinition);
      }

      if (field.relation && field.relation.foreignKey) {
        const fkField = field.relation.foreignKey;
        const referencedTable = field.fieldType;
        const referencedColumn = "id";

        constraints.push(
          `FOREIGN KEY (${fkField}) REFERENCES ${referencedTable} (${referencedColumn})`
        );
      }
    });

    // Add combined unique constraints
    if (model.combinedUniques) {
      model.combinedUniques.forEach((uniqueFields) => {
        constraints.push(`UNIQUE (${uniqueFields.join(", ")})`);
      });
    }

    if (columns.length === 0) {
      console.warn(
        `Warning: Model '${model.name}' has no valid fields to create columns. Skipping table creation.`
      );
      return `-- Skipping CREATE TABLE for ${tableName} as no valid columns were found.`;
    }

    const allParts = [...columns, ...constraints];

    const createTableSql = `CREATE TABLE ${tableName} (\n  ${allParts.join(
      ",\n  "
    )}\n);`;

    return createTableSql;
  }

  private mapFieldTypeToSql(fieldType: string): string | undefined {
    const typeMapping = TYPE_MAPPINGS[fieldType];
    if (typeMapping) {
      return typeMapping[this.dialect] || typeMapping["generic"];
    }
    return undefined;
  }
}
