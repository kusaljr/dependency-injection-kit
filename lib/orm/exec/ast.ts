import * as fs from "fs";
import * as path from "path";
import { Lexer, Token } from "../core/lexer";
import { Parser } from "../core/parser";
import { SemanticAnalyzer, SemanticError } from "../core/semantic-analyzer";
import { generateTypeCode } from "../types/type-generator";
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
  throw new Error("No AST generated");
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

const typeCode = generateTypeCode(ast);
const outPath = path.join(__dirname, "..", "types", "schema-types.ts");

fs.writeFileSync(outPath, typeCode, { encoding: "utf8" });
export { ast, semanticErrors, tokens };
