import { SchemaNode } from "./ast";
import { Models } from "./schema-types";

// ---------- UTILITY TYPES ----------
type ForeignKeyOf<
  M extends Models,
  Source extends keyof M,
  Target extends keyof M
> = {
  [K in keyof M[Source]]: K extends `${infer Related}_id`
    ? Related extends Target
      ? K
      : never
    : never;
}[keyof M[Source]];

type HasForeignKeyTo<
  M extends Models,
  Source extends keyof M,
  Target extends keyof M
> = ForeignKeyOf<M, Source, Target> extends never ? false : true;

type CompatibleJoins<M extends Models, T extends keyof M> = {
  [K in keyof M]: K extends T
    ? never
    : HasForeignKeyTo<M, T, K> extends true
    ? K
    : HasForeignKeyTo<M, K, T> extends true
    ? K
    : never;
}[keyof M];

type StrictJoinOn<M extends Models, T extends keyof M, J extends keyof M> =
  | (ForeignKeyOf<M, T, J> extends keyof M[T]
      ? `${T & string}.${ForeignKeyOf<M, T, J> & string} = ${J & string}.id`
      : never)
  | (ForeignKeyOf<M, J, T> extends keyof M[J]
      ? `${J & string}.${ForeignKeyOf<M, J, T> & string} = ${T & string}.id`
      : never);

type Condition<M extends Models, T extends keyof M> = Partial<M[T]>;

type SelectFieldFrom<M extends Models, Tables extends keyof M> = {
  [T in Tables]: {
    [K in keyof M[T]]: `${T & string}.${K & string}`;
  }[keyof M[T]];
}[Tables];

type JoinType = "inner" | "left" | "right";

interface JoinClause<M extends Models> {
  target: keyof M;
  type: JoinType;
  on: string;
}

// ---------- QUERY CLASS ----------
class Query<
  M extends Models,
  T extends keyof M,
  F extends string = SelectFieldFrom<M, T>,
  JT extends keyof M = T
> {
  private selectedFields: F[];
  private conditions: Condition<M, T>;
  private joins: JoinClause<M>[];
  private limitValue: number | null;
  private offsetValue: number | null;
  private joinedTables: JT[];

  constructor(
    private tableName: T,
    fields: F[] = [],
    conditions: Condition<M, T> = {},
    joins: JoinClause<M>[] = [],
    limit: number | null = null,
    offset: number | null = null,
    joinedTables: JT[] = [tableName as unknown as JT]
  ) {
    this.selectedFields = fields;
    this.conditions = conditions;
    this.joins = joins;
    this.limitValue = limit;
    this.offsetValue = offset;
    this.joinedTables = joinedTables;
  }

  public select<N extends SelectFieldFrom<M, JT>>(
    fields: N[]
  ): Query<M, T, N, JT> {
    return new Query(
      this.tableName,
      fields,
      this.conditions,
      this.joins,
      this.limitValue,
      this.offsetValue,
      this.joinedTables
    );
  }

  public where(conditions: Condition<M, T>): Query<M, T, F, JT> {
    return new Query(
      this.tableName,
      this.selectedFields,
      conditions,
      this.joins,
      this.limitValue,
      this.offsetValue,
      this.joinedTables
    );
  }

  public limit(n: number): Query<M, T, F, JT> {
    return new Query(
      this.tableName,
      this.selectedFields,
      this.conditions,
      this.joins,
      n,
      this.offsetValue,
      this.joinedTables
    );
  }

  public offset(n: number): Query<M, T, F, JT> {
    return new Query(
      this.tableName,
      this.selectedFields,
      this.conditions,
      this.joins,
      this.limitValue,
      n,
      this.joinedTables
    );
  }

  public innerJoin<J extends CompatibleJoins<M, JT>>(
    target: J,
    on: StrictJoinOn<M, JT, J>
  ): Query<M, T, F, JT | J> {
    return this.addJoin("inner", target, on);
  }

  public leftJoin<J extends CompatibleJoins<M, JT>>(
    target: J,
    on: StrictJoinOn<M, JT, J>
  ): Query<M, T, F, JT | J> {
    return this.addJoin("left", target, on);
  }

  public rightJoin<J extends CompatibleJoins<M, JT>>(
    target: J,
    on: StrictJoinOn<M, JT, J>
  ): Query<M, T, F, JT | J> {
    return this.addJoin("right", target, on);
  }

  private addJoin<J extends keyof M>(
    type: JoinType,
    target: J,
    on: string
  ): Query<M, T, F, JT | J> {
    const newJoins = [...this.joins, { target, type, on }];
    const newJoinedTables = [...this.joinedTables, target] as (JT | J)[];
    return new Query(
      this.tableName,
      this.selectedFields,
      this.conditions,
      newJoins,
      this.limitValue,
      this.offsetValue,
      newJoinedTables
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
      .map(([field, value]) => `${String(field)} = ${JSON.stringify(value)}`)
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

// ---------- TABLE CLASS ----------
class Table<M extends Models, T extends keyof M> {
  constructor(private tableName: T) {}

  public select<F extends SelectFieldFrom<M, T>>(
    fields: F[]
  ): Query<M, T, F, T> {
    return new Query(this.tableName, fields);
  }

  public where(
    conditions: Condition<M, T>
  ): Query<M, T, SelectFieldFrom<M, T>, T> {
    return new Query(this.tableName, [], conditions);
  }

  public innerJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: StrictJoinOn<M, T, J>
  ): Query<M, T, SelectFieldFrom<M, T | J>, T | J> {
    return new Query(
      this.tableName,
      [],
      {},
      [{ target, type: "inner", on }],
      null,
      null,
      [this.tableName, target]
    );
  }

  public leftJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: StrictJoinOn<M, T, J>
  ): Query<M, T, SelectFieldFrom<M, T | J>, T | J> {
    return new Query(
      this.tableName,
      [],
      {},
      [{ target, type: "left", on }],
      null,
      null,
      [this.tableName, target]
    );
  }

  public rightJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: StrictJoinOn<M, T, J>
  ): Query<M, T, SelectFieldFrom<M, T | J>, T | J> {
    return new Query(
      this.tableName,
      [],
      {},
      [{ target, type: "right", on }],
      null,
      null,
      [this.tableName, target]
    );
  }
}

// ---------- DB CLASS ----------
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
