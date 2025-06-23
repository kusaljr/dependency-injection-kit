import { SchemaNode } from "../core/ast";
import { DB } from "../query-builder/query-builder";
import { ast } from "./ast";
import { sqlClient } from "./client";

const db = new DB(ast as SchemaNode, sqlClient);

export { db };
