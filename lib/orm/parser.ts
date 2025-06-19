import { FieldNode, ModelNode, RelationEnum, SchemaNode } from "./ast";
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

  private peek(offset: number = 0): Token {
    return this.tokens[this.currentTokenIndex + offset];
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
          this.advance();
        }
      } else {
        const unexpectedToken = this.peek();
        this.errors.push(
          new SyntaxError(
            `Unexpected token '${unexpectedToken.value}' inside model '${nameToken.value}'. Expected field definition, composite block, or '}'.`,
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
      combinedUniques: combinedUniques,
      line: modelKeywordToken.line,
      column: modelKeywordToken.column,
    };
  }

  private parseCompositeUniqueFields(): string[] {
    this.consume(TokenType.LPAREN, "Expected '(' after @@unique");
    this.consume(TokenType.LBRACKET, "Expected '[' after @@unique(");

    const fields: string[] = [];

    while (this.peek().type !== TokenType.RBRACKET) {
      const idToken = this.consume(
        TokenType.IDENTIFIER,
        "Expected field name in @@unique"
      );
      fields.push(idToken.value);

      if (this.peek().type === TokenType.COMMA) {
        this.advance();
      } else if (this.peek().type !== TokenType.RBRACKET) {
        throw new SyntaxError(
          "Expected ',' or ']' in @@unique field list",
          this.peek().line,
          this.peek().column
        );
      }
    }

    this.consume(
      TokenType.RBRACKET,
      "Expected ']' to close @@unique field list"
    );
    this.consume(TokenType.RPAREN, "Expected ')' after @@unique field list");

    return fields;
  }

  private parseFieldDefinition(): FieldNode {
    const nameToken = this.consume(
      TokenType.IDENTIFIER,
      "Expected field name (identifier)."
    );

    let fieldTypeStr = "";
    let isArray = false;

    if (this.peek().type === TokenType.INT_TYPE) {
      fieldTypeStr = "int";
      this.advance();
    } else if (this.peek().type === TokenType.STRING_TYPE) {
      fieldTypeStr = "string";
      this.advance();
    } else if (this.peek().type === TokenType.FLOAT_TYPE) {
      fieldTypeStr = "float";
      this.advance();
    } else if (this.peek().type === TokenType.IDENTIFIER) {
      fieldTypeStr = this.advance().value;

      if (this.peek().value === "[" && this.peek(1)?.value === "]") {
        this.advance(); // [
        this.advance(); // ]
        isArray = true;
      }
    } else {
      const token = this.peek();
      throw new SyntaxError(
        `Expected field type ('int', 'string', or model name) after field '${nameToken.value}', but found '${token.value}' (${token.type}).`,
        token.line,
        token.column
      );
    }

    let relation: FieldNode["relation"] | undefined = undefined;
    let isPrimaryKey = false;
    let isRequired = false;
    let isUnique = false;
    let defaultValue: string | number | boolean | object | undefined =
      undefined;

    while (this.peek().type === TokenType.AT) {
      this.advance(); // consume @
      const decoratorToken = this.consume(
        TokenType.IDENTIFIER,
        "Expected decorator name after '@'."
      );

      const decoratorName = decoratorToken.value;

      if (
        decoratorName === "one_to_many" ||
        decoratorName === "many_to_one" ||
        decoratorName === "one_to_one"
      ) {
        let foreignKey: string | undefined = undefined;

        if (this.peek().type === TokenType.LPAREN) {
          this.advance(); // (
          const fkToken = this.consume(
            TokenType.IDENTIFIER,
            "Expected foreign key field inside relation decorator."
          );
          foreignKey = fkToken.value;
          this.consume(
            TokenType.RPAREN,
            "Expected ')' to close relation decorator arguments."
          );
        }

        relation = {
          type: decoratorName as RelationEnum,
          foreignKey,
        };
      } else if (decoratorName === "primary_key") {
        isPrimaryKey = true;
      } else if (decoratorName === "unique") {
        isUnique = true;
      } else if (decoratorName === "required") {
        // 'required' is a synonym for 'not null'
        if (defaultValue !== undefined) {
          throw new SyntaxError(
            `Field '${nameToken.value}' cannot have both @default and @required decorators.`,
            decoratorToken.line,
            decoratorToken.column
          );
        }
        isRequired = true;
      } else if (decoratorName === "default") {
        this.consume(TokenType.LPAREN, "Expected '(' after '@default'.");

        const valueToken = this.advance();
        let rawValue: string = valueToken.value;

        // Parse as number, boolean, string, or JSON object
        if (valueToken.type === TokenType.NUMBER_LITERAL) {
          defaultValue = Number(rawValue);
        } else if (valueToken.type === TokenType.STRING_LITERAL) {
          defaultValue = rawValue;
        } else if (
          valueToken.type === TokenType.IDENTIFIER &&
          (rawValue === "true" || rawValue === "false")
        ) {
          defaultValue = rawValue === "true";
        } else if (valueToken.type === TokenType.LCURLY) {
          let objStr = "{";
          let braceCount = 1;
          while (braceCount > 0) {
            const tok = this.advance();
            objStr += tok.value;
            if (tok.type === TokenType.LCURLY) braceCount++;
            if (tok.type === TokenType.RCURLY) braceCount--;
          }
          try {
            defaultValue = JSON.parse(objStr);
          } catch {
            throw new SyntaxError(
              `Invalid JSON object in @default: ${objStr}`,
              valueToken.line,
              valueToken.column
            );
          }
        } else {
          throw new SyntaxError(
            `Unsupported default value: '${rawValue}'`,
            valueToken.line,
            valueToken.column
          );
        }

        this.consume(TokenType.RPAREN, "Expected ')' after @default value.");
      } else {
        throw new SyntaxError(
          `Unknown decorator '${decoratorName}'`,
          decoratorToken.line,
          decoratorToken.column
        );
      }
    }

    return {
      kind: "Field",
      name: nameToken.value,
      fieldType: fieldTypeStr,
      isArray,
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
