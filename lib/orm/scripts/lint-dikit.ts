import fs from "fs";
import { Lexer } from "../lexer";
import { Parser } from "../parser";

const filePath: string | undefined = process.argv[2];

if (!filePath) {
  console.error("No file specified");
  process.exit(1);
}

const text: string = fs.readFileSync(filePath, "utf8");
const tokens = new Lexer(text).tokenize();
const { errors } = new Parser(tokens).parse();

errors.forEach((e: { line: number; column: number; message: string }) => {
  console.log(`${filePath}:${e.line}:${e.column}: ${e.message}`);
});

if (errors.length > 0) {
  process.exit(1);
}
