import * as fs from "fs";

export enum TokenType {
  MODEL_KEYWORD = "MODEL_KEYWORD",
  TYPE_KEYWORD = "TYPE_KEYWORD",

  INT_TYPE = "INT_TYPE",
  STRING_TYPE = "STRING_TYPE",
  FLOAT_TYPE = "FLOAT_TYPE",
  BOOLEAN_TYPE = "BOOLEAN_TYPE",
  JSON_TYPE = "JSON_TYPE",
  JSON_ARRAY_TYPE = "JSON_ARRAY_TYPE",
  DATETIME_TYPE = "DATETIME_TYPE",

  COLON = "COLON", // :

  LCURLY = "LCURLY", // {
  RCURLY = "RCURLY", // }
  LPAREN = "LPAREN", // (
  RPAREN = "RPAREN", // )
  LBRACKET = "LBRACKET", // [
  RBRACKET = "RBRACKET", // ]
  COMMA = "COMMA", // ,
  AT = "AT", // @
  COMPOSITE_BLOCK = "COMPOSITE_BLOCK", // @@unique @@index

  IDENTIFIER = "IDENTIFIER",

  STRING_LITERAL = "STRING_LITERAL",
  NUMBER_LITERAL = "NUMBER_LITERAL",

  TYPESCRIPT_INTERFACE = "TYPESCRIPT_INTERFACE",

  EOF = "EOF",
  UNKNOWN = "UNKNOWN",
  type = "type",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class Lexer {
  private input: string;
  private position = 0;
  private lineNumber = 1;
  private columnNumber = 1;
  private expectingJsonBlock = false;

  constructor(input: string) {
    this.input = input;
  }

  private peek(offset = 0): string | undefined {
    return this.input[this.position + offset];
  }

  private advance(): string {
    const char = this.input[this.position++];
    if (char === "\n") {
      this.lineNumber++;
      this.columnNumber = 1;
    } else {
      this.columnNumber++;
    }
    return char;
  }

  private createToken(
    type: TokenType,
    value: string = "",
    lengthOverride?: number
  ): Token {
    const length = lengthOverride ?? value.length;
    return {
      type,
      value,
      line: this.lineNumber,
      column: this.columnNumber - length,
    };
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    let token: Token;

    do {
      token = this.getNextToken();
      if (token.type !== TokenType.UNKNOWN) {
        tokens.push(token);
      }
    } while (token.type !== TokenType.EOF);

    return tokens;
  }

  private consumeCurlyBlock(): string {
    let value = "";
    let depth = 0;

    while (this.position < this.input.length) {
      const char = this.advance();
      value += char;

      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) break;
      }
    }

    return value;
  }

  private getNextToken(): Token {
    this.skipWhitespaceAndComments();

    if (this.position >= this.input.length) {
      return this.createToken(TokenType.EOF);
    }

    const char = this.peek();

    switch (char) {
      case "{":
        if (this.expectingJsonBlock) {
          this.expectingJsonBlock = false;
          const jsonBlock = this.consumeCurlyBlock();
          return this.createToken(
            TokenType.TYPESCRIPT_INTERFACE,
            jsonBlock,
            jsonBlock.length
          );
        } else {
          this.advance();
          return this.createToken(TokenType.LCURLY, "{");
        }
      case "}":
        this.advance();
        return this.createToken(TokenType.RCURLY, "}");
      case "(":
        this.advance();
        return this.createToken(TokenType.LPAREN, "(");
      case ")":
        this.advance();
        return this.createToken(TokenType.RPAREN, ")");
      case "[":
        this.advance();
        return this.createToken(TokenType.LBRACKET, "[");
      case "]":
        this.advance();
        return this.createToken(TokenType.RBRACKET, "]");
      case ",":
        this.advance();
        return this.createToken(TokenType.COMMA, ",");

      case ":":
        this.advance();
        return this.createToken(TokenType.COLON, ":");
      case "@":
        if (this.peek(1) === "@") {
          this.advance();
          this.advance();
          const value = this.consumeWhile(/[a-zA-Z_]/);
          if (["unique", "index", "id"].includes(value)) {
            return this.createToken(TokenType.COMPOSITE_BLOCK, `@@${value}`);
          } else {
            console.warn(
              `Unknown composite block '@@${value}' at ${this.lineNumber}:${this.columnNumber}`
            );
            return this.createToken(TokenType.UNKNOWN, `@@${value}`);
          }
        } else {
          this.advance();
          return this.createToken(TokenType.AT, "@");
        }
      case '"':
      case "'":
        return this.consumeStringLiteral(char);

      default:
        if (/[a-zA-Z_]/.test(char!)) {
          const value = this.consumeWhile(/[a-zA-Z_0-9]/);
          switch (value) {
            case "model":
              return this.createToken(TokenType.MODEL_KEYWORD, value);
            case "type":
              return this.createToken(TokenType.TYPE_KEYWORD, value);
            case "int":
              return this.createToken(TokenType.INT_TYPE, value);
            case "string":
              return this.createToken(TokenType.STRING_TYPE, value);
            case "float":
              return this.createToken(TokenType.FLOAT_TYPE, value);
            case "boolean":
              return this.createToken(TokenType.BOOLEAN_TYPE, value);
            case "json": {
              const jsonToken = this.createToken(
                this.peek() === "[" && this.peek(1) === "]"
                  ? TokenType.JSON_ARRAY_TYPE
                  : TokenType.JSON_TYPE,
                value
              );

              this.skipWhitespaceAndComments();
              if (this.peek() === "[") {
                this.advance();
                if (this.peek() === "]") {
                  this.advance();
                } else {
                  throw new Error(
                    `Invalid json[] syntax at line ${this.lineNumber}, column ${this.columnNumber}`
                  );
                }
              }

              this.skipWhitespaceAndComments();
              if (this.peek() !== "{") {
                throw new Error(
                  `Expected '{' after json type at line ${this.lineNumber}, column ${this.columnNumber}`
                );
              }

              this.expectingJsonBlock = true;
              return jsonToken;
            }
            case "datetime":
              return this.createToken(TokenType.DATETIME_TYPE, value);
            default:
              return this.createToken(TokenType.IDENTIFIER, value);
          }
        }

        if (/[0-9]/.test(char!)) {
          return this.consumeNumberLiteral();
        }

        const unknown = this.advance();
        console.warn(
          `Unexpected character '${unknown}' at ${this.lineNumber}:${this.columnNumber}`
        );
        return this.createToken(TokenType.UNKNOWN, unknown);
    }
  }

  private skipWhitespaceAndComments(): void {
    while (this.position < this.input.length) {
      const char = this.peek();
      if (/\s/.test(char!)) {
        this.advance();
      } else if (char === "/" && this.peek(1) === "/") {
        this.advance();
        this.advance();
        while (this.peek() !== "\n" && this.peek() !== undefined) {
          this.advance();
        }
      } else if (char === "/" && this.peek(1) === "*") {
        this.advance();
        this.advance();
        while (this.position < this.input.length) {
          const c = this.advance();
          if (c === "*" && this.peek() === "/") {
            this.advance();
            break;
          }
        }
      } else {
        break;
      }
    }
  }

  private consumeWhile(regex: RegExp): string {
    let value = "";
    while (this.peek() && regex.test(this.peek()!)) {
      value += this.advance();
    }
    return value;
  }

  private consumeNumberLiteral(): Token {
    let value = this.consumeWhile(/[0-9]/);
    if (this.peek() === ".") {
      value += this.advance();
      if (!/[0-9]/.test(this.peek()!)) {
        console.warn(
          `Invalid number format at ${this.lineNumber}:${this.columnNumber}`
        );
        return this.createToken(TokenType.UNKNOWN, value);
      }
      value += this.consumeWhile(/[0-9]/);
    }
    return this.createToken(TokenType.NUMBER_LITERAL, value);
  }

  private consumeStringLiteral(quote: string): Token {
    this.advance(); // consume opening quote
    let value = "";
    while (this.peek() !== quote && this.peek() !== undefined) {
      const char = this.advance();
      if (char === "\\") {
        value += char + this.advance(); // naive escape handling
      } else {
        value += char;
      }
    }
    if (this.peek() === quote) {
      this.advance(); // consume closing quote
      return this.createToken(
        TokenType.STRING_LITERAL,
        value,
        value.length + 2
      );
    } else {
      console.warn(
        `Unterminated string literal at ${this.lineNumber}:${this.columnNumber}`
      );
      return this.createToken(TokenType.UNKNOWN, value);
    }
  }

  public static fromFile(filePath: string): Token[] {
    try {
      const input = fs.readFileSync(filePath, "utf-8");
      const lexer = new Lexer(input);
      return lexer.tokenize();
    } catch (err: any) {
      console.error(`Error reading ${filePath}: ${err.message}`);
      return [];
    }
  }
}
