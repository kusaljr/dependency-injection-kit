import { SQL } from "bun";
import * as fs from "fs";
import path from "path";
import { SchemaNode } from "./core/ast";
import { Lexer, Token } from "./core/lexer";
import { Parser } from "./core/parser";
import { SemanticAnalyzer, SemanticError } from "./core/semantic-analyzer";
import { DB } from "./query-builder/query-builder";
import { generateTypeCode } from "./types/type-generator";

const schemaFilePath = "schema.dikit";

console.log(`Processing schema from: ${schemaFilePath}\n`);

const tokens: Token[] = Lexer.fromFile(schemaFilePath);

if (tokens.length === 0) {
  console.error("No tokens generated. Cannot parse or analyze.");
  process.exit(1);
}

const parser = new Parser(tokens);
const { ast, errors: parsingErrors } = parser.parse();

if (parsingErrors.length > 0) {
  console.error("\n--- Parsing Errors Detected ---");
  parsingErrors.forEach((err) => console.error(err.message));
  console.error("\nParsing failed due to errors. Aborting semantic analysis.");
  process.exit(1);
}

if (!ast) {
  console.error(
    "\nNo AST generated despite no reported parsing errors. Internal parser issue."
  );
  process.exit(1);
}

const semanticAnalyzer = new SemanticAnalyzer(ast);
const semanticErrors: SemanticError[] = semanticAnalyzer.analyze();

if (semanticErrors.length > 0) {
  console.error("\n--- Semantic Errors Detected ---");
  semanticErrors.forEach((err) => console.error(err.message));
  console.error(
    "\nSemantic analysis failed due to errors. Aborting SQL generation."
  );
  process.exit(1);
}

console.log("\n--- Schema Successfully Validated! ---");
// console.log("AST (Simplified View):");
// console.log(JSON.stringify(ast, null, 2));

// ast.models.forEach((model) => {
//   console.log(`  Model: ${model.name}`);
//   model.fields.forEach((field) => {
//     console.log(`    Field: ${field.name} (${field.fieldType})`);
//   });
// });

// migrate(ast)
//   .then(() => {
//     console.log("\n✅ Migration completed successfully.");
//   })
//   .catch((err) => {
//     console.error("\n❌ Migration failed:", err);
//     process.exit(1);
//   });

const typeCode = generateTypeCode(ast);

// Output file path
const outPath = path.join(__dirname, "schema-types.ts");

fs.writeFileSync(outPath, typeCode, { encoding: "utf8" });

console.log(`✅ Type definitions written to ${outPath}`);

const sqlClient = new SQL({
  url: process.env.DATABASE_URL,
});

async function main(ast: SchemaNode) {
  const db = new DB(ast, sqlClient);
  const result = await db.transaction(async (tx) => {
    const user = await tx
      .table("users")
      .update({
        name: "Puti",
      })
      .where({
        "users.id": 6,
      })
      .execute();

    console.log("User updated:", user);

    // throw new Error("Simulated error to test transaction rollback");
  });
  console.log("Transaction result:", result);
}

main(ast);
