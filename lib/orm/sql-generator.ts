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
    const foreignKeys: string[] = [];

    model.fields.forEach((field) => {
      const columnName = field.name;

      // Only generate columns for scalar fields (or FK fields)
      if (field.fieldType === "int" || field.fieldType === "string") {
        const sqlType = this.mapFieldTypeToSql(field.fieldType);

        if (!sqlType) {
          console.warn(
            `Warning: Unknown type '${field.fieldType}' for field '${field.name}'. Skipping column generation.`
          );
          return;
        }

        let columnDefinition = `${columnName} ${sqlType}`;

        if (field.name === "id" && field.fieldType === "int") {
          columnDefinition += " PRIMARY KEY";
        }

        columnDefinition += " NOT NULL";
        columns.push(columnDefinition);
      }

      // Generate FK constraint if this field has a relation of type many_to_one or one_to_one
      if (field.relation && field.relation.foreignKey) {
        const fkField = field.relation.foreignKey;
        const referencedTable = field.fieldType;
        const referencedColumn = "id"; // convention: reference 'id'

        foreignKeys.push(
          `FOREIGN KEY (${fkField}) REFERENCES ${referencedTable} (${referencedColumn})`
        );
      }
    });

    if (columns.length === 0) {
      console.warn(
        `Warning: Model '${model.name}' has no valid fields to create columns. Skipping table creation.`
      );
      return `-- Skipping CREATE TABLE for ${tableName} as no valid columns were found.`;
    }

    const allConstraints = [...columns, ...foreignKeys];

    const createTableSql = `CREATE TABLE ${tableName} (\n  ${allConstraints.join(
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
