import { SQL } from "bun";
import * as fs from "fs";
import path from "path";
import { SchemaNode } from "./core/ast";
import { Lexer, Token } from "./core/lexer";
import { Parser } from "./core/parser";
import { SemanticAnalyzer, SemanticError } from "./core/semantic-analyzer";
import { DB } from "./query-builder/query-builder";
import { generateTypeCode } from "./types/type-generator";
const tokens: Token[] = Lexer.fromFile("schema.dikit");

if (tokens.length === 0) {
  console.error("No tokens generated. Cannot parse or analyze.");
  process.exit(1);
}

const parser = new Parser(tokens);
const { ast, errors: parsingErrors } = parser.parse();
// console.log(JSON.stringify(ast, null, 2));
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

// generate types
const typeCode = generateTypeCode(ast);

const outPath = path.join(__dirname, "types", "schema-types.ts");

fs.writeFileSync(outPath, typeCode, { encoding: "utf8" });

console.log(`✅ Type definitions written to ${outPath}`);

const sqlClient = new SQL({
  url: process.env.DATABASE_URL,
});

async function main(ast: SchemaNode) {
  const db = new DB(ast, sqlClient);
  const result = await db
    .table("barcode")
    .update({
      metadata: {
        type: {
          nonce: "asldkfj1234",
        },
      },
    })
    .where({
      "barcode.code": "1C234567890",
      "barcode.metadata": {
        type: {
          nonce: "abc1234",
        },
      },
    })
    .execute();

  console.log("Query Result:", result);
}

main(ast);
// migrate(ast)
//   .then(() => {
//     console.log("\n✅ Migration completed successfully.");
//   })
//   .catch((err) => {
//     console.error("\n❌ Migration failed:", err);
//     process.exit(1);
//   });
