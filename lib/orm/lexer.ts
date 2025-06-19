import * as fs from "fs";

export enum TokenType {
  MODEL_KEYWORD = "MODEL_KEYWORD",
  INT_TYPE = "INT_TYPE",
  STRING_TYPE = "STRING_TYPE",
  FLOAT_TYPE = "FLOAT_TYPE",
  LCURLY = "LCURLY", // {
  RCURLY = "RCURLY", // }

  IDENTIFIER = "IDENTIFIER",

  EOF = "EOF",

  UNKNOWN = "UNKNOWN",

  AT = "AT", // @
  COMPOSITE_BLOCK = "COMPOSITE_BLOCK", // @@unique @@index
  LPAREN = "LPAREN", // (
  RPAREN = "RPAREN", // )
  COMMA = "COMMA", // ,
  LBRACKET = "LBRACKET", // [
  RBRACKET = "RBRACKET", // ]

  STRING_LITERAL = "STRING_LITERAL", // "abc", 'abc'
  NUMBER_LITERAL = "NUMBER_LITERAL", // 123, 4.56
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class Lexer {
  private input: string;
  private position: number = 0;
  private lineNumber: number = 1;
  private columnNumber: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  private peek(offset: number = 0): string | undefined {
    return this.input[this.position + offset];
  }

  private advance(): string | undefined {
    const char = this.input[this.position];
    this.position++;
    this.columnNumber++;
    return char;
  }

  private createToken(type: TokenType, value: string = ""): Token {
    return {
      type,
      value,
      line: this.lineNumber,
      column: this.columnNumber - value.length,
    };
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    let token: Token | null;

    while ((token = this.getNextToken()).type !== TokenType.EOF) {
      if (token.type !== TokenType.UNKNOWN) {
        tokens.push(token);
      }
    }
    tokens.push(token);

    return tokens;
  }

  private getNextToken(): Token {
    this.skipWhitespaceAndComments();

    if (this.position >= this.input.length) {
      return this.createToken(TokenType.EOF, "");
    }

    const char = this.peek();
    const startColumn = this.columnNumber;

    switch (char) {
      case "{":
        this.advance();
        return this.createToken(TokenType.LCURLY, "{");
      case "}":
        this.advance();
        return this.createToken(TokenType.RCURLY, "}");
      case "(":
        this.advance();
        return this.createToken(TokenType.LPAREN, "(");
      case ")":
        this.advance();
        return this.createToken(TokenType.RPAREN, ")");
      case ",":
        this.advance();
        return this.createToken(TokenType.COMMA, ",");
      case "[":
        this.advance();
        return this.createToken(TokenType.LBRACKET, "[");
      case "]":
        this.advance();
        return this.createToken(TokenType.RBRACKET, "]");
    }

    if (char === "@" && this.peek(1) === "@") {
      this.advance();
      this.advance();

      let value = "";
      while (this.peek() && /[a-zA-Z_]/.test(this.peek()!)) {
        value += this.advance();
      }

      if (value === "unique" || value === "index" || value === "id") {
        return this.createToken(TokenType.COMPOSITE_BLOCK, `@@${value}`);
      } else {
        console.warn(
          `Lexing Error: Unknown composite directive '@@${value}' at line ${this.lineNumber}, column ${this.columnNumber}`
        );
        return this.createToken(TokenType.UNKNOWN, `@@${value}`);
      }
    }

    if (char === "@") {
      this.advance();
      return this.createToken(TokenType.AT, "@");
    }

    if (/[a-zA-Z_]/.test(char!)) {
      let value = "";
      while (this.peek() && /[a-zA-Z_0-9]/.test(this.peek()!)) {
        value += this.advance();
      }

      switch (value) {
        case "model":
          return this.createToken(TokenType.MODEL_KEYWORD, value);
        case "int":
          return this.createToken(TokenType.INT_TYPE, value);
        case "string":
          return this.createToken(TokenType.STRING_TYPE, value);
        case "float":
          return this.createToken(TokenType.FLOAT_TYPE, value);
        default:
          return this.createToken(TokenType.IDENTIFIER, value);
      }
    }

    if (/[0-9]/.test(char!)) {
      let value = "";
      let hasDot = false;

      while (this.peek() && /[0-9]/.test(this.peek()!)) {
        value += this.advance();
      }

      if (this.peek() === ".") {
        hasDot = true;
        value += this.advance(); // consume '.'

        if (!/[0-9]/.test(this.peek()!)) {
          console.warn(
            `Lexing Error: Expected digit after '.' in number at line ${this.lineNumber}, column ${this.columnNumber}`
          );
          return this.createToken(TokenType.UNKNOWN, value);
        }

        while (this.peek() && /[0-9]/.test(this.peek()!)) {
          value += this.advance();
        }
      }

      return this.createToken(TokenType.NUMBER_LITERAL, value);
    }

    const unknownChar = this.advance();
    console.warn(
      `Lexing Error: Unexpected character '${unknownChar}' at line ${this.lineNumber}, column ${startColumn}`
    );
    return this.createToken(TokenType.UNKNOWN, unknownChar);
  }

  private skipWhitespaceAndComments(): void {
    while (this.position < this.input.length) {
      const char = this.peek();

      if (char === "\n") {
        this.advance();
        this.lineNumber++;
        this.columnNumber = 1;
        continue;
      }

      if (/\s/.test(char!)) {
        this.advance();
        continue;
      }

      if (char === "/" && this.peek(1) === "/") {
        this.advance();
        this.advance();
        while (this.peek() && this.peek() !== "\n") {
          this.advance();
        }
        continue;
      }

      if (char === "/" && this.peek(1) === "*") {
        this.advance();
        this.advance();
        let foundEnd = false;
        while (this.position < this.input.length) {
          const nextChar = this.advance();
          if (nextChar === "*") {
            if (this.peek() === "/") {
              this.advance();
              foundEnd = true;
              break;
            }
          } else if (nextChar === "\n") {
            this.lineNumber++;
            this.columnNumber = 1;
          }
        }
        if (!foundEnd) {
          console.warn(
            `Lexing Error: Unclosed multi-line comment starting at line ${
              this.lineNumber
            }, column ${this.columnNumber - 2}`
          );
        }
        continue;
      }

      break;
    }
  }

  public static fromFile(filePath: string): Token[] {
    try {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const lexer = new Lexer(fileContent);
      return lexer.tokenize();
    } catch (error: any) {
      console.error(`Error reading file ${filePath}: ${error.message}`);
      return [];
    }
  }
}
