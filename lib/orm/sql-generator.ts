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
  boolean: {
    postgresql: "BOOLEAN",
    mysql: "TINYINT(1)",
    sqlite: "BOOLEAN",
    generic: "BOOLEAN",
  },
  json: {
    postgresql: "JSONB",
    mysql: "JSON",
    sqlite: "TEXT", // SQLite does not have a native JSON type
    generic: "TEXT", // Generic fallback
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

      // Ensure that the field type is recognized for SQL mapping
      if (
        ![
          "int",
          "string",
          "float",
          "boolean",
          "json",
          "date",
          "datetime",
          "timestamp",
        ].includes(field.fieldType)
      ) {
        console.warn(
          `Warning: Unknown or unhandled type '${field.fieldType}' for field '${field.name}'. Skipping column generation.`
        );
        return; // Skip this field if its type is not in our known list
      }

      const sqlType = this.mapFieldTypeToSql(field.fieldType);

      // This check is technically redundant if the above `includes` check is comprehensive
      // but good for robustness if `mapFieldTypeToSql` can return undefined for known types.
      if (!sqlType) {
        console.warn(
          `Warning: No SQL type mapping found for '${field.fieldType}' in dialect '${this.dialect}'. Skipping column generation for field '${field.name}'.`
        );
        return;
      }

      let columnDefinition = `${columnName} ${sqlType}`;

      if (field.isPrimaryKey) {
        // Handle autoincrement specifically for primary keys
        if (
          typeof field.defaultValue === "object" &&
          field.defaultValue.kind === "FunctionCall" &&
          field.defaultValue.name === "autoincrement"
        ) {
          switch (this.dialect) {
            case "postgresql":
              columnDefinition = `${columnName} SERIAL PRIMARY KEY`; // PostgreSQL uses SERIAL for auto-incrementing integers
              break;
            case "mysql":
              columnDefinition += " PRIMARY KEY AUTO_INCREMENT";
              break;
            case "sqlite":
              columnDefinition += " PRIMARY KEY AUTOINCREMENT";
              break;
            case "generic":
            default:
              columnDefinition += " PRIMARY KEY"; // Fallback, might not be truly auto-incrementing
              console.warn(
                `Warning: autoincrement() for primary key on '${this.dialect}' dialect might not be fully supported. Check your database documentation.`
              );
              break;
          }
        } else {
          // For other primary keys without autoincrement
          columnDefinition += " PRIMARY KEY";
        }
      }

      if (field.isUnique) {
        columnDefinition += " UNIQUE";
      }

      if (field.defaultValue !== undefined) {
        if (
          typeof field.defaultValue === "object" &&
          field.defaultValue.kind === "FunctionCall"
        ) {
          // Handle function calls like uuid()
          if (field.defaultValue.name === "now") {
            switch (this.dialect) {
              case "postgresql":
                columnDefinition += ` DEFAULT CURRENT_TIMESTAMP`;
                break;
              case "mysql":
                columnDefinition += ` DEFAULT NOW()`;
                break;
              case "sqlite":
                columnDefinition += ` DEFAULT (DATETIME('now'))`; // SQLite uses DATETIME function
                break;
              case "generic":
              default:
                columnDefinition += ` DEFAULT 'now_placeholder'`; // Generic fallback
                console.warn(
                  `Warning: now() default for '${this.dialect}' dialect might require specific functions or extensions. Check your database documentation.`
                );
                break;
            }
          }

          if (field.defaultValue.name === "autoincrement") {
            // This case is already handled above for primary keys, so we skip it here.
            // If it's not a primary key, we can still handle it as a generic autoincrement.
            console.warn(
              `Warning: autoincrement() default for '${field.name}' field is not applicable unless it's a primary key.`
            );
          }

          if (field.defaultValue.name === "uuid") {
            switch (this.dialect) {
              case "postgresql":
                // PostgreSQL needs `uuid-ossp` extension for `uuid_generate_v4()`
                // Or use `gen_random_uuid()` if PostgreSQL 13+
                // For simplicity, we'll just add DEFAULT gen_random_uuid() for now, assuming compatibility or extension.
                columnDefinition += ` DEFAULT gen_random_uuid()`;
                break;
              case "mysql":
                columnDefinition += ` DEFAULT (UUID())`;
                break;
              case "sqlite":
                columnDefinition += ` DEFAULT (HEX(RANDOMBLOB(16)))`; // SQLite doesn't have native UUID, common workaround
                break;
              case "generic":
              default:
                columnDefinition += ` DEFAULT 'uuid_placeholder'`; // Generic fallback
                console.warn(
                  `Warning: uuid() default for '${this.dialect}' dialect might require specific functions or extensions. Check your database documentation.`
                );
                break;
            }
          }
          // If autoincrement was handled by PRIMARY KEY, we don't add DEFAULT here again.
          // Otherwise, if it's a non-PK autoincrement (uncommon, but possible), it would be handled here.
        } else {
          // Handle literal default values (string, number, boolean)
          const defVal =
            typeof field.defaultValue === "string"
              ? `'${field.defaultValue}'`
              : field.defaultValue;
          columnDefinition += ` DEFAULT ${defVal}`;
        }
      }

      // If it's a primary key and not autoincrementing (or explicitly required),
      // or if it's explicitly required, add NOT NULL
      // Note: AUTO_INCREMENT/SERIAL implies NOT NULL, so no need to add it again.
      const isAutoIncrementedPrimaryKey =
        field.isPrimaryKey &&
        typeof field.defaultValue === "object" &&
        field.defaultValue.kind === "FunctionCall" &&
        field.defaultValue.name === "autoincrement";

      if (
        (field.isPrimaryKey && !isAutoIncrementedPrimaryKey) ||
        field.isRequired
      ) {
        columnDefinition += " NOT NULL";
      }

      columns.push(columnDefinition);
    });

    // Add combined unique constraints
    if (model.combinedUniques && model.combinedUniques.length > 0) {
      model.combinedUniques.forEach((uniqueFields) => {
        constraints.push(`UNIQUE (${uniqueFields.join(", ")})`);
      });
    }

    // Add foreign key constraints
    model.fields.forEach((field) => {
      if (field.relation && field.relation.foreignKey) {
        const fkField = field.relation.foreignKey;
        const referencedTable = field.fieldType; // The type of the field is the referenced model name
        // Assuming primary key of referenced table is 'id'. Adjust if your convention differs.
        const referencedColumn = "id";

        constraints.push(
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
