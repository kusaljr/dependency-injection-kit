import { FieldNode, ModelNode, SchemaNode } from "./ast";

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
  private declaredFieldNamesInCurrentModel: Set<string> = new Set();

  constructor(ast: SchemaNode) {
    this.ast = ast;
  }

  public analyze(): SemanticError[] {
    this.errors = [];
    this.declaredModelNames.clear();

    this.visitSchema(this.ast);

    return this.errors;
  }

  private visitSchema(node: SchemaNode): void {
    node.models.forEach((model) => {
      this.visitModel(model);
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
  }

  private isSnakeCase(name: string): boolean {
    const snakeCaseRegex = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
    return snakeCaseRegex.test(name);
  }
}
