import { SchemaNode } from "./ast";
import { Models } from "./schema-types";

type QualifiedInsertValues<M extends Models, T extends keyof M> = {
  [K in keyof M[T] as `${T & string}.${K & string}`]?: M[T][K];
};

type InsertValues<M extends Models, T extends keyof M> = Partial<
  QualifiedInsertValues<M, T>
>;

type UpdateValues<M extends Models, T extends keyof M> = Partial<{
  [K in keyof M[T] as `${T & string}.${K & string}`]: M[T][K];
}>;

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

type Condition<M extends Models, JT extends keyof M> = Partial<
  {
    [T in JT]: {
      [K in keyof M[T] as `${T & string}.${K & string}`]: M[T][K];
    };
  }[JT]
>;

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

interface PreparedStatement {
  sql: string;
  params: any[];
}

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
  private updateValues: UpdateValues<M, T> | null = null;
  private isDeleteOperation: boolean = false;

  constructor(
    private tableName: T,
    fields: F[] = [],
    conditions: Condition<M, T> = {},
    joins: JoinClause<M>[] = [],
    limit: number | null = null,
    offset: number | null = null,
    joinedTables: JT[] = [tableName as unknown as JT],
    updateValues: UpdateValues<M, T> | null = null,
    isDeleteOperation: boolean = false
  ) {
    this.selectedFields = fields;
    this.conditions = conditions;
    this.joins = joins;
    this.limitValue = limit;
    this.offsetValue = offset;
    this.joinedTables = joinedTables;
    this.updateValues = updateValues;
    this.isDeleteOperation = isDeleteOperation;
  }

  public select<N extends SelectFieldFrom<M, JT>>(
    fields: N[]
  ): Query<M, T, N, JT> {
    if (this.updateValues || this.isDeleteOperation) {
      throw new Error("SELECT cannot be used after update() or delete().");
    }
    return new Query(
      this.tableName,
      fields,
      this.conditions as Condition<M, T>,
      this.joins,
      this.limitValue,
      this.offsetValue,
      this.joinedTables
    );
  }

  public where(conditions: Condition<M, JT>): Query<M, T, F, JT> {
    return new Query<M, T, F, JT>(
      this.tableName,
      this.selectedFields,
      conditions as Condition<M, T>,
      this.joins,
      this.limitValue,
      this.offsetValue,
      this.joinedTables,
      this.updateValues,
      this.isDeleteOperation
    );
  }

  public limit(n: number): Query<M, T, F, JT> {
    if (this.updateValues || this.isDeleteOperation) {
      throw new Error("LIMIT cannot be used with update() or delete().");
    }
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
    if (this.updateValues || this.isDeleteOperation) {
      throw new Error("OFFSET cannot be used with update() or delete().");
    }
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
    if (this.updateValues || this.isDeleteOperation) {
      throw new Error("JOIN cannot be used with update() or delete().");
    }
    return this.addJoin("inner", target, on);
  }

  public leftJoin<J extends CompatibleJoins<M, JT>>(
    target: J,
    on: StrictJoinOn<M, JT, J>
  ): Query<M, T, F, JT | J> {
    if (this.updateValues || this.isDeleteOperation) {
      throw new Error("JOIN cannot be used with update() or delete().");
    }
    return this.addJoin("left", target, on);
  }

  public rightJoin<J extends CompatibleJoins<M, JT>>(
    target: J,
    on: StrictJoinOn<M, JT, J>
  ): Query<M, T, F, JT | J> {
    if (this.updateValues || this.isDeleteOperation) {
      throw new Error("JOIN cannot be used with update() or delete().");
    }
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

  public _update(values: UpdateValues<M, T>): PreparedStatement {
    const setClauses: string[] = [];
    const updateParams: any[] = [];

    for (const field in values) {
      if (values.hasOwnProperty(field)) {
        setClauses.push(`${String(field)} = ?`);
        updateParams.push(values[field]);
      }
    }

    if (setClauses.length === 0) {
      throw new Error("No values provided for update.");
    }

    let sql = `UPDATE ${String(this.tableName)} SET ${setClauses.join(", ")}`;
    const whereClauses: string[] = [];
    const whereParams: any[] = [];

    for (const field in this.conditions) {
      if (this.conditions.hasOwnProperty(field)) {
        whereClauses.push(`${String(field)} = ?`);
        whereParams.push(this.conditions[field]);
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    } else {
      console.warn(
        `WARNING: UPDATE statement for table '${String(
          this.tableName
        )}' has no WHERE clause. All rows will be updated.`
      );
    }
    return { sql, params: [...updateParams, ...whereParams] };
  }

  public _delete(): PreparedStatement {
    let sql = `DELETE FROM ${String(this.tableName)}`;
    const whereClauses: string[] = [];
    const whereParams: any[] = [];

    for (const field in this.conditions) {
      if (this.conditions.hasOwnProperty(field)) {
        whereClauses.push(`${String(field)} = ?`);
        whereParams.push(this.conditions[field]);
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    } else {
      console.warn(
        `WARNING: DELETE statement for table '${String(
          this.tableName
        )}' has no WHERE clause. All rows will be deleted.`
      );
    }
    return { sql, params: whereParams };
  }

  public build(): PreparedStatement {
    if (this.updateValues) {
      return this._update(this.updateValues);
    }
    if (this.isDeleteOperation) {
      return this._delete();
    }

    const fieldsStr =
      this.selectedFields.length > 0 ? this.selectedFields.join(", ") : "*";

    let query = `SELECT ${fieldsStr} FROM ${String(this.tableName)}`;
    const queryParams: any[] = []; // Initialize an array for query parameters

    this.joins.forEach((join) => {
      query += ` ${join.type.toUpperCase()} JOIN ${String(join.target)} ON ${
        join.on
      }`;
    });

    const whereClauses: string[] = [];
    // Iterate through conditions to build prepared statement WHERE clause
    for (const field in this.conditions) {
      if (this.conditions.hasOwnProperty(field)) {
        whereClauses.push(`${String(field)} = ?`); // Use placeholder
        queryParams.push(this.conditions[field]); // Add value to params
      }
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    if (this.limitValue !== null) {
      query += ` LIMIT ?`;
      queryParams.push(this.limitValue); // Add limit value to params
    }

    if (this.offsetValue !== null) {
      query += ` OFFSET ?`;
      queryParams.push(this.offsetValue); // Add offset value to params
    }

    return { sql: query, params: queryParams }; // Return query and its parameters
  }
}

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
    return new Query(this.tableName, [], conditions as Condition<M, T>);
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

  public insert(values: InsertValues<M, T>): PreparedStatement {
    const fields = Object.keys(values);
    const placeholders = fields.map(() => "?").join(", ");
    const params = Object.values(values);

    if (fields.length === 0) {
      throw new Error("No values provided for insertion.");
    }

    const sql = `INSERT INTO ${String(this.tableName)} (${fields.join(
      ", "
    )}) VALUES (${placeholders})`;
    return { sql, params };
  }

  public update(
    values: UpdateValues<M, T>
  ): Query<M, T, SelectFieldFrom<M, T>, T> {
    return new Query(
      this.tableName,
      [],
      {},
      [],
      null,
      null,
      [this.tableName as unknown as T],
      values,
      false
    );
  }

  public delete(): Query<M, T, SelectFieldFrom<M, T>, T> {
    return new Query(
      this.tableName,
      [],
      {},
      [],
      null,
      null,
      [this.tableName as unknown as T],
      null,
      true
    );
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
