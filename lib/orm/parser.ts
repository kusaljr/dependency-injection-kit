import { FieldNode, ModelNode, SchemaNode } from "./ast";
import { Token, TokenType } from "./lexer";

export class SyntaxError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(`Syntax Error at [${line}:${column}]: ${message}`);
    this.name = "SyntaxError";
  }
}

export class Parser {
  private tokens: Token[];
  private currentTokenIndex: number = 0;
  private errors: SyntaxError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.currentTokenIndex];
  }

  private advance(): Token {
    if (this.currentTokenIndex < this.tokens.length) {
      this.currentTokenIndex++;
    }
    return this.tokens[this.currentTokenIndex - 1];
  }

  private consume(expectedType: TokenType, errorMessage: string): Token {
    const currentToken = this.peek();
    if (currentToken.type === expectedType) {
      return this.advance();
    } else {
      const error = new SyntaxError(
        errorMessage,
        currentToken.line,
        currentToken.column
      );
      this.errors.push(error);

      throw error;
    }
  }

  public parse(): { ast: SchemaNode | null; errors: SyntaxError[] } {
    try {
      const models: ModelNode[] = [];
      while (this.peek().type !== TokenType.EOF) {
        const initialTokenIndex = this.currentTokenIndex;
        try {
          models.push(this.parseModelDefinition());
        } catch (e: any) {
          if (e instanceof SyntaxError) {
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
        if (this.currentTokenIndex === initialTokenIndex) {
          const unexpectedToken = this.peek();
          this.errors.push(
            new SyntaxError(
              `Unexpected token '${unexpectedToken.value}' of type ${unexpectedToken.type}`,
              unexpectedToken.line,
              unexpectedToken.column
            )
          );
          this.advance();
        }
      }
      const schemaNode: SchemaNode = {
        kind: "Schema",
        models: models,
        line: 1,
        column: 1,
      };
      return { ast: schemaNode, errors: this.errors };
    } catch (e: any) {
      if (!(e instanceof SyntaxError)) {
        console.error(
          "An unexpected internal error occurred during parsing:",
          e
        );
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
    const modelKeywordToken = this.consume(
      TokenType.MODEL_KEYWORD,
      "Expected 'model' keyword."
    );
    const nameToken = this.consume(
      TokenType.IDENTIFIER,
      "Expected model name (identifier)."
    );
    this.consume(TokenType.LCURLY, "Expected '{' after model name.");

    const fields: FieldNode[] = [];
    while (
      this.peek().type !== TokenType.RCURLY &&
      this.peek().type !== TokenType.EOF
    ) {
      if (this.peek().type === TokenType.IDENTIFIER) {
        fields.push(this.parseFieldDefinition());
      } else {
        const unexpectedToken = this.peek();
        this.errors.push(
          new SyntaxError(
            `Unexpected token '${unexpectedToken.value}' inside model '${nameToken.value}'. Expected field definition or '}'.`,
            unexpectedToken.line,
            unexpectedToken.column
          )
        );
        this.advance();
      }
    }

    this.consume(
      TokenType.RCURLY,
      `Expected '}' to close model '${nameToken.value}'.`
    );

    return {
      kind: "Model",
      name: nameToken.value,
      fields: fields,
      line: modelKeywordToken.line,
      column: modelKeywordToken.column,
    };
  }

  private parseFieldDefinition(): FieldNode {
    const nameToken = this.consume(
      TokenType.IDENTIFIER,
      "Expected field name (identifier)."
    );
    let fieldType: "int" | "string";
    const typeToken = this.peek();

    if (typeToken.type === TokenType.INT_TYPE) {
      fieldType = "int";
      this.advance();
    } else if (typeToken.type === TokenType.STRING_TYPE) {
      fieldType = "string";
      this.advance();
    } else {
      const error = new SyntaxError(
        `Expected field type ('int' or 'string') after field name '${nameToken.value}'. Found '${typeToken.value}' (${typeToken.type}).`,
        typeToken.line,
        typeToken.column
      );
      this.errors.push(error);
      throw error;
    }

    return {
      kind: "Field",
      name: nameToken.value,
      fieldType: fieldType,
      line: nameToken.line,
      column: nameToken.column,
    };
  }
}
