import { SQL } from "bun";
import { SchemaNode } from "../core/ast";
import { Models } from "../types/schema-types";

type InsertValues<M extends Models, T extends keyof M> = Partial<M[T]>;

type UpdateValues<M extends Models, T extends keyof M> = Partial<M[T]>;

type ExecuteResult<
  M extends Models,
  T extends keyof M,
  F extends string
> = F extends never
  ? M[T][]
  : Array<{
      [K in F as K extends `${string}.${infer Col}`
        ? Col
        : never]: K extends `${infer Table}.${infer Col}`
        ? Table extends keyof M
          ? Col extends keyof M[Table]
            ? M[Table][Col]
            : never
          : never
        : never;
    }>;

type ForeignKeyOf<
  M extends Models,
  Source extends keyof M,
  Target extends keyof M
> = {
  [K in keyof M[Source]]: K extends `${infer Related}_id`
    ? Target extends `${Related}` | `${Related}s`
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
    [K in keyof M[T]]: M[T][K] extends object
      ? never // Exclude relations (objects/arrays)
      : `${T & string}.${K & string}`;
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
  private modelsDef: Models; // Added modelsDef property

  constructor(
    private tableName: T,
    private sqlClient: SQL, // Use SQLClient type here
    fields: F[] = [],
    conditions: Condition<M, T> = {},
    joins: JoinClause<M>[] = [],
    limit: number | null = null,
    offset: number | null = null,
    joinedTables: JT[] = [tableName as unknown as JT],
    updateValues: UpdateValues<M, T> | null = null,
    isDeleteOperation: boolean = false,
    modelsDef: Models // Added modelsDef to constructor
  ) {
    this.selectedFields = fields;
    this.conditions = conditions;
    this.joins = joins;
    this.limitValue = limit;
    this.offsetValue = offset;
    this.joinedTables = joinedTables;
    this.updateValues = updateValues;
    this.isDeleteOperation = isDeleteOperation;
    this.modelsDef = modelsDef; // Initialized modelsDef
  }

  public select<N extends SelectFieldFrom<M, JT>>(
    fields: N[]
  ): Query<M, T, N, JT> {
    if (this.updateValues || this.isDeleteOperation) {
      throw new Error("SELECT cannot be used after update() or delete().");
    }
    return new Query(
      this.tableName,
      this.sqlClient,
      fields,
      this.conditions as Condition<M, T>,
      this.joins,
      this.limitValue,
      this.offsetValue,
      this.joinedTables,
      null,
      false,
      this.modelsDef // Pass modelsDef
    );
  }

  public where(conditions: Condition<M, JT>): Query<M, T, F, JT> {
    return new Query<M, T, F, JT>(
      this.tableName,
      this.sqlClient,
      this.selectedFields,
      conditions as Condition<M, T>,
      this.joins,
      this.limitValue,
      this.offsetValue,
      this.joinedTables,
      this.updateValues,
      this.isDeleteOperation,
      this.modelsDef // Pass modelsDef
    );
  }

  public limit(n: number): Query<M, T, F, JT> {
    if (this.updateValues || this.isDeleteOperation) {
      throw new Error("LIMIT cannot be used with update() or delete().");
    }
    return new Query(
      this.tableName,
      this.sqlClient,
      this.selectedFields,
      this.conditions,
      this.joins,
      n,
      this.offsetValue,
      this.joinedTables,
      null,
      false,
      this.modelsDef // Pass modelsDef
    );
  }

  public offset(n: number): Query<M, T, F, JT> {
    if (this.updateValues || this.isDeleteOperation) {
      throw new Error("OFFSET cannot be used with update() or delete().");
    }
    return new Query(
      this.tableName,
      this.sqlClient,
      this.selectedFields,
      this.conditions,
      this.joins,
      this.limitValue,
      n,
      this.joinedTables,
      null,
      false,
      this.modelsDef // Pass modelsDef
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
      this.sqlClient,
      this.selectedFields,
      this.conditions,
      newJoins,
      this.limitValue,
      this.offsetValue,
      newJoinedTables,
      null,
      false,
      this.modelsDef // Pass modelsDef
    );
  }

  private _update(values: UpdateValues<M, T>): PreparedStatement {
    const setClauses: string[] = [];
    const updateParams: any[] = [];
    let index = 1;
    for (const field in values) {
      if (values.hasOwnProperty(field)) {
        setClauses.push(`${String(field)} = $${index++}`);
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
        whereClauses.push(`${String(field)} = $${index++}`);
        whereParams.push(this.conditions[field]);
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(" AND ")} RETURNING *`;
    } else {
      console.warn(
        `WARNING: UPDATE statement for table '${String(
          this.tableName
        )}' has no WHERE clause. All rows will be updated.`
      );
    }
    return { sql, params: [...updateParams, ...whereParams] };
  }

  private _delete(): PreparedStatement {
    let sql = `DELETE FROM ${String(this.tableName)}`;
    const whereClauses: string[] = [];
    const whereParams: any[] = [];
    let index = 1;
    for (const field in this.conditions) {
      if (this.conditions.hasOwnProperty(field)) {
        whereClauses.push(`${String(field)} = $${index++}`);
        whereParams.push(this.conditions[field]);
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(" AND ")} RETURNING *`;
    } else {
      console.warn(
        `WARNING: DELETE statement for table '${String(
          this.tableName
        )}' has no WHERE clause. All rows will be deleted.`
      );
    }
    return { sql, params: whereParams };
  }

  private buildJsonAggSQL(): { query: string; params: any[] } {
    const mainTable = String(this.tableName);
    const mainTableDef = this.modelsDef[mainTable as keyof Models];

    if (!mainTableDef) {
      throw new Error(`Schema definition not found for table: ${mainTable}`);
    }

    const join = this.joins[0]; // assume 1 join for now
    if (!join) {
      throw new Error("json_agg requires at least one join");
    }

    const joinTable = String(join.target);
    const joinTableDef = this.modelsDef[joinTable as keyof Models];
    if (!joinTableDef) {
      throw new Error(
        `Schema definition not found for joined table: ${joinTable}`
      );
    }

    // Use select fields provided
    const mainFieldsArr = this.selectedFields
      .filter((f) => f.startsWith(`${mainTable}.`))
      .map((f) => f);

    const joinFieldsArr = this.selectedFields
      .filter((f) => f.startsWith(`${joinTable}.`))
      .map((f) => {
        const fieldName = f.split(".")[1];
        return `'${fieldName}', ${f}`;
      });

    if (mainFieldsArr.length === 0) {
      throw new Error(`No select fields provided for main table: ${mainTable}`);
    }

    if (joinFieldsArr.length === 0) {
      throw new Error(`No select fields provided for join table: ${joinTable}`);
    }

    const mainFields = mainFieldsArr.join(", ");
    const joinFields = joinFieldsArr.join(", ");

    // WHERE clause
    const whereClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(this.conditions)) {
      whereClauses.push(`${k} = $${idx++}`);
      params.push(v);
    }

    // Build query
    let query = `
    SELECT 
      ${mainFields},
      json_agg(
        json_build_object(${joinFields})
      ) AS ${joinTable}s
    FROM ${mainTable}
    ${join.type.toUpperCase()} JOIN ${joinTable} ON ${join.on}
  `;

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(" AND ")} `;
    }

    query += ` GROUP BY ${mainFields} `;

    return { query, params };
  }

  public async execute(): Promise<ExecuteResult<M, T, F>> {
    if (this.updateValues) {
      const { sql: sqlString, params } = this._update(this.updateValues);
      console.log("Executing SQL:", sqlString, params);
      const res = await this.sqlClient.unsafe(sqlString, params); // Use await here
      console.log("Update Result:", res);
      return res;
    }

    if (this.isDeleteOperation) {
      const { sql: sqlString, params } = this._delete();
      console.log("Executing SQL:", sqlString, params);
      return await this.sqlClient.unsafe(sqlString, params); // Use await here
    }

    // Determine if it's a json_agg query
    const isJsonAggQuery = this.joins.length > 0;

    if (isJsonAggQuery) {
      console.log("Detected JSON_AGG query with joins and no selected fields.");
      const { query, params } = this.buildJsonAggSQL();
      console.log("Executing JSON_AGG SQL:", query, "with params:", params);
      return this.sqlClient.unsafe(query, params);
    }

    let paramIndex = 1;

    // SELECT query (regular select)
    const fieldsStr =
      this.selectedFields.length > 0
        ? this.selectedFields.join(", ")
        : `${String(this.tableName)}.*`;

    let query = `SELECT ${fieldsStr} FROM ${String(this.tableName)}`;
    const queryParams: any[] = [];

    this.joins.forEach((join) => {
      query += ` ${join.type.toUpperCase()} JOIN ${String(join.target)} ON ${
        join.on
      }`;
    });

    const whereClauses: string[] = [];
    // Conditions can refer to fields from any joined table, so we iterate through all joinedTables
    for (const conditionKey in this.conditions) {
      if (this.conditions.hasOwnProperty(conditionKey)) {
        whereClauses.push(`${conditionKey} = $${paramIndex++}`);
        queryParams.push((this.conditions as any)[conditionKey]);
      }
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    if (this.limitValue !== null) {
      query += ` LIMIT $${paramIndex++}`; // Use placeholder for LIMIT
      queryParams.push(this.limitValue);
    }

    if (this.offsetValue !== null) {
      query += ` OFFSET $${paramIndex++}`;
      queryParams.push(this.offsetValue);
    }

    console.log("Executing SQL:", query, "with params:", queryParams);

    return this.sqlClient.unsafe(query, queryParams);
  }
}

class Table<M extends Models, T extends keyof M> {
  constructor(
    private tableName: T,
    private sqlClient: SQL,
    private modelsDef: Models
  ) {} // Use SQLClient type here
  public select<F extends SelectFieldFrom<M, T>>(
    fields: F[]
  ): Query<M, T, F, T> {
    return new Query(
      this.tableName,
      this.sqlClient,
      fields,
      {},
      [],
      null,
      null,
      [this.tableName as unknown as T],
      null,
      false,
      this.modelsDef
    );
  }

  public where(
    conditions: Condition<M, T>
  ): Query<M, T, SelectFieldFrom<M, T>, T> {
    return new Query(
      this.tableName,
      this.sqlClient,
      [],
      conditions as Condition<M, T>,
      [],
      null,
      null,
      [this.tableName as unknown as T],
      null,
      false,
      this.modelsDef // Pass modelsDef
    );
  }

  public innerJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: StrictJoinOn<M, T, J>
  ): Query<M, T, SelectFieldFrom<M, T | J>, T | J> {
    return new Query(
      this.tableName,
      this.sqlClient,
      [],
      {},
      [{ target, type: "inner", on }],
      null,
      null,
      [this.tableName, target],
      null,
      false,
      this.modelsDef // Pass modelsDef
    );
  }

  public leftJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: StrictJoinOn<M, T, J>
  ): Query<M, T, SelectFieldFrom<M, T | J>, T | J> {
    return new Query(
      this.tableName,
      this.sqlClient,
      [],
      {},
      [{ target, type: "left", on }],
      null,
      null,
      [this.tableName, target],
      null,
      false,
      this.modelsDef // Pass modelsDef
    );
  }

  public rightJoin<J extends CompatibleJoins<M, T>>(
    target: J,
    on: StrictJoinOn<M, T, J>
  ): Query<M, T, SelectFieldFrom<M, T | J>, T | J> {
    return new Query(
      this.tableName,
      this.sqlClient,
      [],
      {},
      [{ target, type: "right", on }],
      null,
      null,
      [this.tableName, target],
      null,
      false,
      this.modelsDef // Pass modelsDef
    );
  }

  public async insert(values: InsertValues<M, T> | InsertValues<M, T>[]) {
    const isArray = Array.isArray(values);
    const rows = isArray ? values : [values];

    if (rows.length === 0) {
      throw new Error("No values provided for insertion.");
    }

    const fields = Object.keys(rows[0]);
    if (fields.length === 0) {
      throw new Error("Insert object must have at least one field.");
    }

    const allParams: any[] = [];

    const allPlaceholders: string[] = [];

    rows.forEach((row, rowIndex) => {
      const rowParams = fields.map((f) => (row as Record<string, any>)[f]);
      allParams.push(...rowParams);

      const offset = rowIndex * fields.length;
      const rowPlaceholders = fields
        .map((_, i) => `$${offset + i + 1}`)
        .join(", ");
      allPlaceholders.push(`(${rowPlaceholders})`);
    });

    const sqlQuery = `INSERT INTO ${String(this.tableName)} (${fields.join(
      ", "
    )}) VALUES ${allPlaceholders.join(", ")} RETURNING *`;

    console.log("Executing SQL:", sqlQuery, "with params:", allParams);

    const result = await this.sqlClient.unsafe(sqlQuery, allParams);
    return isArray ? result : result[0];
  }
  public async upsert(options: {
    create: InsertValues<M, T>;
    update?: InsertValues<M, T>;
    on: Partial<M[T]>;
  }) {
    const { create, update, on } = options;

    const insertData = update ? { ...create, ...update } : create;

    const insertFields = Object.keys(insertData);
    const insertPlaceholders = insertFields
      .map((_, i) => `$${i + 1}`)
      .join(", ");
    const insertValues = insertFields.map(
      (f) => insertData[f as keyof typeof insertData]
    );

    const conflictFields = Object.keys(on);
    if (conflictFields.length === 0) {
      throw new Error("Conflict target cannot be empty.");
    }

    const updateFields = update ? Object.keys(update) : insertFields;
    const updateAssignments = updateFields
      .map((f) => `${f} = EXCLUDED.${f}`)
      .join(", ");

    const sqlQuery = `INSERT INTO ${String(
      this.tableName
    )} (${insertFields.join(", ")}) VALUES (${insertPlaceholders})
ON CONFLICT (${conflictFields.join(", ")})
DO UPDATE SET ${updateAssignments}
RETURNING *`;

    console.log("Executing SQL:", sqlQuery, "with params:", insertValues);

    const [res] = await this.sqlClient.unsafe(sqlQuery, insertValues);
    return res;
  }

  public update(
    values: UpdateValues<M, T>
  ): Query<M, T, SelectFieldFrom<M, T>, T> {
    return new Query(
      this.tableName,
      this.sqlClient,
      [],
      {},
      [],
      null,
      null,
      [this.tableName as unknown as T],
      values,
      false,
      this.modelsDef // Pass modelsDef
    );
  }

  public delete(): Query<M, T, SelectFieldFrom<M, T>, T> {
    return new Query(
      this.tableName,
      this.sqlClient,
      [],
      {},
      [],
      null,
      null,
      [this.tableName as unknown as T],
      null,
      true,
      this.modelsDef // Pass modelsDef
    );
  }
}

export class DB<M extends Models> {
  private modelsDef: Models; // Add modelsDef to DB class

  constructor(private ast: SchemaNode, private sqlClient: SQL) {
    // Populate modelsDef from ast.models
    this.modelsDef = {} as M;
    this.ast.models.forEach((model) => {
      // Assuming model.name is the table name and model.fields define its structure
      // You might need to adjust this based on the exact structure of SchemaNode and its models
      (this.modelsDef as any)[model.name] = model.fields.reduce(
        (acc: any, field: any) => {
          acc[field.name] = field.type; // Store field name and type (or whatever defines it as non-object)
          return acc;
        },
        {}
      );
    });
  }

  public table<T extends keyof M>(tableName: T): Table<M, T> {
    const modelExists = this.ast.models.some((m) => m.name === tableName);
    if (!modelExists) {
      throw new Error(
        `Table '${String(tableName)}' does not exist in the schema.`
      );
    }
    return new Table<M, T>(tableName, this.sqlClient, this.modelsDef); // Pass modelsDef to Table
  }

  public async transaction<R>(
    callback: (txDB: DB<M>) => Promise<R>
  ): Promise<R> {
    return this.sqlClient.begin(async (tx) => {
      const txDB = new DB<M>(this.ast, tx as typeof this.sqlClient);
      return callback(txDB);
    });
  }
}
