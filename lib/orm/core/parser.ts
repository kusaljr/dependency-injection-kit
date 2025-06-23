import {
  FieldNode,
  JsonTypeDefinitionNode,
  ModelNode,
  RelationEnum,
  SchemaNode,
} from "./ast";
import { Token, TokenType } from "./lexer";

export class SyntaxError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(`Syntax Error at [${line}:${column}]: ${message}`);
    this.name = "SyntaxError";
  }
}

export class Parser {
  private tokens: Token[];
  private currentTokenIndex = 0;
  private errors: SyntaxError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return (
      this.tokens[this.currentTokenIndex + offset] ??
      this.tokens[this.tokens.length - 1]
    );
  }

  private advance(): Token {
    if (this.currentTokenIndex < this.tokens.length) {
      this.currentTokenIndex++;
    }
    return this.tokens[this.currentTokenIndex - 1];
  }

  private consume(expectedType: TokenType, errorMessage: string): Token {
    const token = this.peek();
    if (token.type === expectedType) {
      return this.advance();
    }
    const err = new SyntaxError(errorMessage, token.line, token.column);
    this.errors.push(err);
    throw err;
  }

  public parse(): { ast: SchemaNode | null; errors: SyntaxError[] } {
    try {
      const models: ModelNode[] = [];

      while (this.peek().type !== TokenType.EOF) {
        const initialIndex = this.currentTokenIndex;
        try {
          models.push(this.parseModelDefinition());
        } catch (e) {
          if (e instanceof SyntaxError) {
            // error recovery: skip until next model or EOF
            while (
              this.peek().type !== TokenType.MODEL_KEYWORD &&
              this.peek().type !== TokenType.EOF
            ) {
              this.advance();
            }
          } else {
            throw e;
          }
        }

        if (this.currentTokenIndex === initialIndex) {
          const tok = this.peek();
          this.errors.push(
            new SyntaxError(
              `Unexpected token '${tok.value}'`,
              tok.line,
              tok.column
            )
          );
          this.advance();
        }
      }

      return {
        ast: {
          kind: "Schema",
          models,
          line: 1,
          column: 1,
        },
        errors: this.errors,
      };
    } catch (e: any) {
      if (!(e instanceof SyntaxError)) {
        console.error("Unexpected parser error:", e);
        this.errors.push(
          new SyntaxError(
            `Internal error: ${e.message}`,
            this.peek().line,
            this.peek().column
          )
        );
      }
      return { ast: null, errors: this.errors };
    }
  }

  private parseModelDefinition(): ModelNode {
    const modelToken = this.consume(
      TokenType.MODEL_KEYWORD,
      "Expected 'model' keyword"
    );
    const nameToken = this.consume(TokenType.IDENTIFIER, "Expected model name");
    this.consume(TokenType.LCURLY, "Expected '{' after model name");

    const fields: FieldNode[] = [];
    const combinedUniques: string[][] = [];

    while (
      this.peek().type !== TokenType.RCURLY &&
      this.peek().type !== TokenType.EOF
    ) {
      if (this.peek().type === TokenType.IDENTIFIER) {
        fields.push(this.parseFieldDefinition());
      } else if (this.peek().type === TokenType.COMPOSITE_BLOCK) {
        const blockToken = this.advance();
        if (blockToken.value === "@@unique") {
          combinedUniques.push(this.parseCompositeUniqueFields());
        } else {
          this.errors.push(
            new SyntaxError(
              `Unsupported composite block '${blockToken.value}'`,
              blockToken.line,
              blockToken.column
            )
          );
        }
      } else {
        const tok = this.peek();
        this.errors.push(
          new SyntaxError(
            `Unexpected token '${tok.value}' inside model`,
            tok.line,
            tok.column
          )
        );
        this.advance();
      }
    }

    this.consume(
      TokenType.RCURLY,
      `Expected '}' to close model '${nameToken.value}'`
    );

    return {
      kind: "Model",
      name: nameToken.value,
      fields,
      combinedUniques,
      line: modelToken.line,
      column: modelToken.column,
    };
  }

  private parseCompositeUniqueFields(): string[] {
    this.consume(TokenType.LPAREN, "Expected '(' after @@unique");
    this.consume(TokenType.LBRACKET, "Expected '[' after @@unique(");

    const fields: string[] = [];
    while (this.peek().type !== TokenType.RBRACKET) {
      const tok = this.consume(
        TokenType.IDENTIFIER,
        "Expected field name in @@unique"
      );
      fields.push(tok.value);

      if (this.peek().type === TokenType.COMMA) {
        this.advance();
      } else if (this.peek().type !== TokenType.RBRACKET) {
        throw new SyntaxError(
          "Expected ',' or ']' in @@unique",
          this.peek().line,
          this.peek().column
        );
      }
    }

    this.consume(TokenType.RBRACKET, "Expected ']' in @@unique");
    this.consume(TokenType.RPAREN, "Expected ')' after @@unique");
    return fields;
  }

  private parseJsonTypeDefinitionFromRaw(
    raw: string,
    line: number,
    column: number,
    isArray = false
  ): JsonTypeDefinitionNode {
    // Just store the raw string directly instead of parsing fields
    return {
      kind: "JsonTypeDefinition",
      raw,
      line,
      isArray,
      column,
    };
  }

  private parseFieldDefinition(): FieldNode {
    const nameToken = this.consume(TokenType.IDENTIFIER, "Expected field name");

    let fieldType = "";
    let jsonTypeDefinition: JsonTypeDefinitionNode | undefined;

    const typeToken = this.peek();
    if (
      typeToken.type === TokenType.INT_TYPE ||
      typeToken.type === TokenType.STRING_TYPE ||
      typeToken.type === TokenType.FLOAT_TYPE ||
      typeToken.type === TokenType.BOOLEAN_TYPE ||
      typeToken.type === TokenType.DATETIME_TYPE
    ) {
      fieldType = typeToken.value;
      this.advance();
    } else if (
      typeToken.type === TokenType.JSON_TYPE ||
      typeToken.type === TokenType.JSON_ARRAY_TYPE
    ) {
      fieldType = "json";
      this.advance();

      if (
        this.peek(-1).type === TokenType.LBRACKET &&
        this.peek(-2).type === TokenType.RBRACKET
      ) {
        this.advance();
        this.advance();
      }

      // Require a TYPESCRIPT_INTERFACE token next
      const interfaceToken = this.peek();
      if (interfaceToken.type !== TokenType.TYPESCRIPT_INTERFACE) {
        throw new SyntaxError(
          `Expected JSON type block after 'json `,
          interfaceToken.line,
          interfaceToken.column
        );
      }

      // Advance and parse the block content
      const raw = this.advance().value;
      jsonTypeDefinition = this.parseJsonTypeDefinitionFromRaw(
        raw,
        interfaceToken.line,
        interfaceToken.column,
        typeToken.type === TokenType.JSON_ARRAY_TYPE
      );
    } else if (typeToken.type === TokenType.IDENTIFIER) {
      fieldType = typeToken.value;
      this.advance();
    } else {
      throw new SyntaxError(
        `Unexpected type '${typeToken.value}'`,
        typeToken.line,
        typeToken.column
      );
    }

    if (
      this.peek().type === TokenType.LBRACKET &&
      this.peek(1).type === TokenType.RBRACKET
    ) {
      this.advance();
      this.advance();
    }

    let relation: FieldNode["relation"];
    let isPrimaryKey = false;
    let isRequired = false;
    let isUnique = false;
    let defaultValue: any; // Using 'any' as it can be literal or object

    while (this.peek().type === TokenType.AT) {
      this.advance();
      const decoName = this.consume(
        TokenType.IDENTIFIER,
        "Expected decorator name"
      ).value;

      if (["one_to_many", "many_to_one", "one_to_one"].includes(decoName)) {
        let foreignKey: string | undefined;
        if (this.peek().type === TokenType.LPAREN) {
          this.advance();
          foreignKey = this.consume(
            TokenType.IDENTIFIER,
            "Expected foreign key"
          ).value;
          this.consume(TokenType.RPAREN, "Expected ')' after foreign key");
        }
        relation = { type: decoName as RelationEnum, foreignKey };
      } else if (decoName === "primary_key") {
        isPrimaryKey = true;
      } else if (decoName === "unique") {
        isUnique = true;
      } else if (decoName === "required") {
        isRequired = true;
      } else if (decoName === "default") {
        this.consume(TokenType.LPAREN, "Expected '(' after @default"); // Consume opening paren for @default

        const valTok = this.peek(); // Peek, don't advance yet

        if (valTok.type === TokenType.NUMBER_LITERAL) {
          defaultValue = Number(this.advance().value);
        } else if (valTok.type === TokenType.STRING_LITERAL) {
          defaultValue = this.advance().value;
        } else if (valTok.type === TokenType.IDENTIFIER) {
          if (["true", "false"].includes(valTok.value)) {
            defaultValue = this.advance().value === "true";
          } else if (valTok.value === "autoincrement") {
            this.advance(); // consume 'autoincrement'
            this.consume(TokenType.LPAREN, "Expected '(' after autoincrement"); // consume '(' of autoincrement()
            this.consume(
              TokenType.RPAREN,
              "Expected ')' after autoincrement()"
            ); // consume ')' of autoincrement()
            defaultValue = { kind: "FunctionCall", name: "autoincrement" };
          } else if (valTok.value === "uuid") {
            this.advance(); // consume 'uuid'
            this.consume(TokenType.LPAREN, "Expected '(' after uuid"); // consume '(' of uuid()
            this.consume(TokenType.RPAREN, "Expected ')' after uuid()"); // consume ')' of uuid()
            defaultValue = { kind: "FunctionCall", name: "uuid" };
          } else if (valTok.value === "now") {
            this.advance(); // consume 'now'
            this.consume(TokenType.LPAREN, "Expected '(' after now"); // consume '(' of now()
            this.consume(TokenType.RPAREN, "Expected ')' after now()"); // consume ')' of now()
            defaultValue = { kind: "FunctionCall", name: "now" };
          } else {
            throw new SyntaxError(
              `Invalid default value '${valTok.value}'`,
              valTok.line,
              valTok.column
            );
          }
        } else {
          throw new SyntaxError(
            `Invalid default value '${valTok.value}'`,
            valTok.line,
            valTok.column
          );
        }
        // This RPAREN is for the @default() wrapper
        this.consume(TokenType.RPAREN, "Expected ')' after @default value");
      } else {
        throw new SyntaxError(
          `Unknown decorator '@${decoName}'`,
          this.peek(-1).line,
          this.peek(-1).column
        );
      }
    }

    return {
      kind: "Field",
      name: nameToken.value,
      fieldType,
      jsonTypeDefinition,
      relation,
      isPrimaryKey,
      isRequired,
      isUnique,
      defaultValue,
      line: nameToken.line,
      column: nameToken.column,
    };
  }
}
