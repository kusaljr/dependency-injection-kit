import { SchemaNode } from "./ast";
import { Models } from "./schema-types";

type Condition<M extends Models, T extends keyof M> = Partial<M[T]>;

class Query<M extends Models, T extends keyof M, F extends keyof M[T]> {
  private selectedFields: F[] = [];
  private conditions: Condition<M, T> = {};
  private limitValue: number | null = null;
  private offsetValue: number | null = null;

  constructor(
    private tableName: T,
    fields: F[] = [],
    conditions: Condition<M, T> = {},
    limit?: number | null,
    offset?: number | null
  ) {
    this.selectedFields = fields;
    this.conditions = conditions;
    this.limitValue = limit ?? null;
    this.offsetValue = offset ?? null;
  }

  public select<N extends keyof M[T]>(fields: N[]): Query<M, T, N> {
    return new Query(
      this.tableName,
      fields,
      this.conditions,
      this.limitValue,
      this.offsetValue
    );
  }

  public where(conditions: Condition<M, T>): Query<M, T, F> {
    return new Query(
      this.tableName,
      this.selectedFields,
      conditions,
      this.limitValue,
      this.offsetValue
    );
  }

  public limit(n: number): Query<M, T, F> {
    return new Query(
      this.tableName,
      this.selectedFields,
      this.conditions,
      n,
      this.offsetValue
    );
  }

  public offset(n: number): Query<M, T, F> {
    return new Query(
      this.tableName,
      this.selectedFields,
      this.conditions,
      this.limitValue,
      n
    );
  }

  public build(): string {
    const fieldsStr =
      this.selectedFields.length > 0 ? this.selectedFields.join(", ") : "*";
    let query = `SELECT ${fieldsStr} FROM ${String(this.tableName)}`;

    const whereClauses = Object.entries(this.conditions)
      .map(([field, value]) => `${field} = ${JSON.stringify(value)}`)
      .join(" AND ");
    if (whereClauses) {
      query += ` WHERE ${whereClauses}`;
    }

    if (this.limitValue !== null) {
      query += ` LIMIT ${this.limitValue}`;
    }
    if (this.offsetValue !== null) {
      query += ` OFFSET ${this.offsetValue}`;
    }

    return query;
  }
}

class Table<M extends Models, T extends keyof M> {
  constructor(private tableName: T) {}

  public select<F extends keyof M[T]>(fields: F[]): Query<M, T, F> {
    return new Query<M, T, F>(this.tableName, fields);
  }

  public where(conditions: Condition<M, T>): Query<M, T, keyof M[T]> {
    return new Query<M, T, keyof M[T]>(this.tableName, [], conditions);
  }
}

export class DB<M extends Models> {
  constructor(private ast: SchemaNode) {}

  public table<T extends keyof M>(tableName: T): Table<M, T> {
    const modelExists = this.ast.models.some((m) => m.name === tableName);
    if (!modelExists) {
      throw new Error(
        `Table '${String(tableName)}' does not exist in the schema.`
      );
    }
    return new Table<M, T>(tableName);
  }
}
