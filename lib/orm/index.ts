import * as fs from "fs";
import path from "path";
import { Lexer, Token } from "./lexer";
import { Parser } from "./parser";
import { DB } from "./query-builder";
import { SemanticAnalyzer, SemanticError } from "./semantic-analyzer";
import { SqlGenerator } from "./sql-generator";
import { generateTypeCode } from "./type-generator";

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
console.log("AST (Simplified View):");
// console.log(JSON.stringify(ast, null, 2));

ast.models.forEach((model) => {
  console.log(`  Model: ${model.name}`);
  model.fields.forEach((field) => {
    console.log(`    Field: ${field.name} (${field.fieldType})`);
  });
});

const sqlGenerator = new SqlGenerator(ast, "postgresql");
const sqlStatements: string[] = sqlGenerator.generate();

if (sqlStatements.length > 0) {
  console.log("\n--- Generated SQL DDL Statements ---");
  sqlStatements.forEach((stmt) => {
    console.log(stmt);
    console.log("\n---");
  });
} else {
  console.log("No SQL statements generated.");
}

const typeCode = generateTypeCode(ast);

// Output file path
const outPath = path.join(__dirname, "schema-types.ts");

fs.writeFileSync(outPath, typeCode, { encoding: "utf8" });

console.log(`✅ Type definitions written to ${outPath}`);

const db = new DB(ast);

const query = db.table("barcode").select(["barcode.code", "barcode.id"]);

console.log(query);
