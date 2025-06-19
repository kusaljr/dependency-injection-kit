import { SchemaNode } from "./ast";
import { Models } from "./schema-types";

type Condition<M extends Models, T extends keyof M> = Partial<M[T]>;
type JoinType = "inner" | "left" | "right";

interface JoinClause<M extends Models> {
  target: keyof M;
  type: JoinType;
  on: string;
}

// Exclude self joins
type CompatibleJoins<M, T extends keyof M> = Exclude<keyof M, T>;

// Type-safe ON condition
type JoinOn<M, T extends keyof M, J extends keyof M> = `${T &
  string}.${keyof M[T] & string} = ${J & string}.${keyof M[J] & string}`;

class Query<
  M extends Models,
  T extends keyof M,
  F extends keyof M[T] = keyof M[T]
> {
  private selectedFields: F[];
  private conditions: Condition<M, T>;
  private joins: JoinClause<M>[];
  private limitValue: number | null;
  private offsetValue: number | null;

  constructor(
    private tableName: T,
    fields: F[] = [],
    conditions: Condition<M, T> = {},
    joins: JoinClause<M>[] = [],
    limit: number | null = null,
    offset: number | null = null
  ) {
    this.selectedFields = fields;
    this.conditions = conditions;
    this.joins = joins;
    this.limitValue = limit;
    this.offsetValue = offset;
  }

  public select<N extends keyof M[T]>(fields: N[]): Query<M, T, N> {
    return new Query(
      this.tableName,
      fields,
      this.conditions,
      this.joins,
      this.limitValue,
      this.offsetValue
    );
  }

  public where(conditions: Condition<M, T>): Query<M, T, F> {
    return new Query(
      this.tableName,
      this.selectedFields,
      conditions,
      this.joins,
      this.limitValue,
      this.offsetValue
    );
  }

  public limit(n: number): Query<M, T, F> {
    return new Query(
      this.tableName,
      this.selectedFields,
      this.conditions,
      this.joins,
      n,
      this.offsetValue
    );
  }

  public offset(n: number): Query<M, T, F> {
    return new Query(
      this.tableName,
      this.selectedFields,
      this.conditions,
      this.joins,
      this.limitValue,
      n
    );
  }

  public innerJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: JoinOn<M, T, J>
  ): Query<M, T, F> {
    return this.addJoin("inner", target, on);
  }

  public leftJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: JoinOn<M, T, J>
  ): Query<M, T, F> {
    return this.addJoin("left", target, on);
  }

  public rightJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: JoinOn<M, T, J>
  ): Query<M, T, F> {
    return this.addJoin("right", target, on);
  }

  private addJoin<J extends keyof M>(
    type: JoinType,
    target: J,
    on: string
  ): Query<M, T, F> {
    const newJoins = [...this.joins, { target, type, on }];
    return new Query(
      this.tableName,
      this.selectedFields,
      this.conditions,
      newJoins,
      this.limitValue,
      this.offsetValue
    );
  }

  public build(): string {
    const fieldsStr =
      this.selectedFields.length > 0 ? this.selectedFields.join(", ") : "*";
    let query = `SELECT ${fieldsStr} FROM ${String(this.tableName)}`;

    this.joins.forEach((join) => {
      query += ` ${join.type.toUpperCase()} JOIN ${String(join.target)} ON ${
        join.on
      }`;
    });

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
    return new Query(this.tableName, fields);
  }

  public where(conditions: Condition<M, T>): Query<M, T, keyof M[T]> {
    return new Query(this.tableName, [], conditions);
  }

  public innerJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: JoinOn<M, T, J>
  ): Query<M, T, keyof M[T]> {
    return new Query(this.tableName, [], {}, [{ target, type: "inner", on }]);
  }

  public leftJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: JoinOn<M, T, J>
  ): Query<M, T, keyof M[T]> {
    return new Query(this.tableName, [], {}, [{ target, type: "left", on }]);
  }

  public rightJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: JoinOn<M, T, J>
  ): Query<M, T, keyof M[T]> {
    return new Query(this.tableName, [], {}, [{ target, type: "right", on }]);
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
