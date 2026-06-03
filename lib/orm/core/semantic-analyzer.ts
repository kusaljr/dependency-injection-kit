import { EnumNode, FieldNode, ModelNode, SchemaNode } from "./ast";

export class SemanticError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(`Semantic Error at [${line}:${column}]: ${message}`);
    this.name = "SemanticError";
  }
}

export class SemanticAnalyzer {
  private ast: SchemaNode;
  private errors: SemanticError[] = [];

  private declaredModelNames: Set<string> = new Set();
  private declaredEnumNames: Set<string> = new Set();
  private declaredFieldNamesInCurrentModel: Set<string> = new Set();

  constructor(ast: SchemaNode) {
    this.ast = ast;
  }

  public analyze(): SemanticError[] {
    this.errors = [];
    this.declaredModelNames.clear();
    this.declaredEnumNames.clear();

    this.visitSchema(this.ast);

    return this.errors;
  }

  private visitSchema(node: SchemaNode): void {
    if (node.enums) {
      node.enums.forEach((enumNode) => {
        this.visitEnum(enumNode);
      });
    }
    node.models.forEach((model) => {
      this.visitModel(model);
    });
  }

  private visitEnum(node: EnumNode): void {
    if (this.declaredEnumNames.has(node.name)) {
      this.errors.push(
        new SemanticError(
          `Duplicate enum name '${node.name}'. Enum names must be unique.`,
          node.line,
          node.column
        )
      );
    } else {
      this.declaredEnumNames.add(node.name);
    }

    if (node.values.length === 0) {
      this.errors.push(
        new SemanticError(
          `Enum '${node.name}' must have at least one value.`,
          node.line,
          node.column
        )
      );
    }

    const seenValues = new Set<string>();
    node.values.forEach((val) => {
      if (seenValues.has(val)) {
        this.errors.push(
          new SemanticError(
            `Duplicate enum value '${val}' in enum '${node.name}'.`,
            node.line,
            node.column
          )
        );
      }
      seenValues.add(val);
    });
  }

  private visitModel(node: ModelNode): void {
    if (this.declaredModelNames.has(node.name)) {
      this.errors.push(
        new SemanticError(
          `Duplicate model name '${node.name}'. Model names must be unique.`,
          node.line,
          node.column
        )
      );
    } else {
      this.declaredModelNames.add(node.name);
    }

    if (!this.isSnakeCase(node.name)) {
      this.errors.push(
        new SemanticError(
          `Model name '${node.name}' must be in snake_case (e.g., 'user_profile'). Do not use capital letters or hyphens.`,
          node.line,
          node.column
        )
      );
    }

    this.declaredFieldNamesInCurrentModel.clear();

    node.fields.forEach((field) => {
      this.visitField(field);
    });
  }

  private visitField(node: FieldNode): void {
    if (this.declaredFieldNamesInCurrentModel.has(node.name)) {
      this.errors.push(
        new SemanticError(
          `Duplicate field name '${node.name}' in model. Field names within a model must be unique.`,
          node.line,
          node.column
        )
      );
    } else {
      this.declaredFieldNamesInCurrentModel.add(node.name);
    }

    if (!this.isSnakeCase(node.name)) {
      this.errors.push(
        new SemanticError(
          `Field name '${node.name}' must be in snake_case (e.g., 'first_name'). Do not use capital letters or hyphens.`,
          node.line,
          node.column
        )
      );
    }

    if (node.enumValues !== undefined && !this.declaredEnumNames.has(node.fieldType)) {
      this.errors.push(
        new SemanticError(
          `Enum type '${node.fieldType}' is not declared. Declare it with 'enum ${node.fieldType} { ... }' before using it.`,
          node.line,
          node.column
        )
      );
    }
  }

  private isSnakeCase(name: string): boolean {
    const snakeCaseRegex = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
    return snakeCaseRegex.test(name);
  }
}
