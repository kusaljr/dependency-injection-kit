import { Lexer, Token, TokenType } from "../orm/core/lexer";
import { Parser, SyntaxError } from "../orm/core/parser";
import { SemanticAnalyzer, SemanticError } from "../orm/core/semantic-analyzer";
import { SchemaNode, ModelNode, FieldNode, EnumNode } from "../orm/core/ast";

// ── LSP Types ──────────────────────────────────────────────────────────────

interface LspMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

interface Position {
  line: number;
  character: number;
}

interface Range {
  start: Position;
  end: Position;
}

// ── Semantic Token Types (LSP standard legend) ────────────────────────────

const TOKEN_TYPES = [
  "namespace", "type", "class", "enum", "interface",
  "struct", "typeParameter", "parameter", "variable", "property",
  "enumMember", "event", "function", "method", "macro",
  "keyword", "modifier", "comment", "string", "number",
  "regexp", "operator", "decorator",
] as const;

type TokenTypeIndex = number;

const TOKEN_MODIFIERS = [
  "declaration", "definition", "readonly", "static", "deprecated",
  "abstract", "async", "modification", "documentation", "defaultLibrary",
] as const;

function tokenTypeToIndex(
  type: TokenType,
  value: string,
  state: DocumentState
): TokenTypeIndex {
  switch (type) {
    case TokenType.MODEL_KEYWORD:
    case TokenType.ENUM_KEYWORD:
      return TOKEN_TYPES.indexOf("keyword");
    case TokenType.TYPE_KEYWORD:
      return TOKEN_TYPES.indexOf("keyword");
    case TokenType.INT_TYPE:
    case TokenType.STRING_TYPE:
    case TokenType.FLOAT_TYPE:
    case TokenType.BOOLEAN_TYPE:
    case TokenType.DATETIME_TYPE:
    case TokenType.JSON_TYPE:
    case TokenType.JSON_ARRAY_TYPE:
      return TOKEN_TYPES.indexOf("type");
    case TokenType.IDENTIFIER:
      if (state.ast) {
        if (state.ast.models?.some((m) => m.name === value))
          return TOKEN_TYPES.indexOf("type");
        if (state.ast.enums?.some((e) => e.name === value))
          return TOKEN_TYPES.indexOf("enum");
        if (state.ast.enums?.some((e) => e.values.includes(value)))
          return TOKEN_TYPES.indexOf("enumMember");
      }
      return TOKEN_TYPES.indexOf("property");
    case TokenType.STRING_LITERAL:
      return TOKEN_TYPES.indexOf("string");
    case TokenType.NUMBER_LITERAL:
      return TOKEN_TYPES.indexOf("number");
    case TokenType.TYPESCRIPT_INTERFACE:
      return TOKEN_TYPES.indexOf("type");
    case TokenType.AT:
      return TOKEN_TYPES.indexOf("decorator");
    case TokenType.COMPOSITE_BLOCK:
      return TOKEN_TYPES.indexOf("decorator");
    case TokenType.LCURLY:
    case TokenType.RCURLY:
    case TokenType.LPAREN:
    case TokenType.RPAREN:
    case TokenType.LBRACKET:
    case TokenType.RBRACKET:
    case TokenType.COMMA:
    case TokenType.COLON:
      return TOKEN_TYPES.indexOf("operator");
    default:
      return TOKEN_TYPES.indexOf("variable");
  }
}

// ── Document State ─────────────────────────────────────────────────────────

interface DocumentState {
  uri: string;
  text: string;
  tokens: Token[];
  ast: SchemaNode | null;
  errors: (SyntaxError | SemanticError)[];
}

class DocumentStore {
  private docs = new Map<string, DocumentState>();

  get(uri: string): DocumentState | undefined {
    return this.docs.get(uri);
  }

  open(uri: string, text: string): DocumentState {
    const state = this.parse(uri, text);
    this.docs.set(uri, state);
    return state;
  }

  update(uri: string, text: string): DocumentState {
    const state = this.parse(uri, text);
    this.docs.set(uri, state);
    return state;
  }

  close(uri: string): void {
    this.docs.delete(uri);
  }

  private parse(uri: string, text: string): DocumentState {
    const lexer = new Lexer(text);
    const tokens = lexer.tokenize();
    const errors: (SyntaxError | SemanticError)[] = [];

    const parser = new Parser(tokens);
    const { ast, errors: parseErrors } = parser.parse();
    errors.push(...parseErrors);

    if (ast) {
      const analyzer = new SemanticAnalyzer(ast);
      const semanticErrors = analyzer.analyze();
      errors.push(...semanticErrors);
    }

    return { uri, text, tokens, ast, errors };
  }
}

// ── JSON-RPC / LSP Protocol ───────────────────────────────────────────────

const store = new DocumentStore();
let requestId = 0;

function sendMessage(msg: LspMessage): void {
  const body = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n`;
  process.stdout.write(header + body);
}

function sendDiagnostics(uri: string, errors: (SyntaxError | SemanticError)[]): void {
  const diagnostics = errors.map((err) => ({
    range: {
      start: { line: err.line - 1, character: Math.max(0, err.column - 1) },
      end: { line: err.line - 1, character: err.column + 50 },
    },
    severity: 1,
    source: "dikit",
    message: err.message,
  }));

  sendMessage({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: { uri, diagnostics },
  });
}

function handleInitialize(params: any): any {
  return {
    capabilities: {
      textDocumentSync: { openClose: true, change: 1 },
      semanticTokensProvider: {
        legend: {
          tokenTypes: [...TOKEN_TYPES],
          tokenModifiers: [...TOKEN_MODIFIERS],
        },
        full: true,
      },
      completionProvider: {
        triggerCharacters: [" ", "@", "("],
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
    },
    serverInfo: { name: "dikit-lsp", version: "1.0.0" },
  };
}

function handleDidOpen(params: any): void {
  const { uri, text } = params.textDocument;
  const state = store.open(uri, text);
  sendDiagnostics(uri, state.errors);
}

function handleDidChange(params: any): void {
  const { uri } = params.textDocument;
  const text = params.contentChanges[0]?.text;
  if (text !== undefined) {
    const state = store.update(uri, text);
    sendDiagnostics(uri, state.errors);
  }
}

function handleDidClose(params: any): void {
  store.close(params.textDocument.uri);
}

function handleSemanticTokens(params: any): any {
  const state = store.get(params.textDocument.uri);
  if (!state) return { data: [] };

  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;

  for (const token of state.tokens) {
    if (token.type === TokenType.EOF || token.type === TokenType.UNKNOWN) continue;
    if (token.type === TokenType.TYPESCRIPT_INTERFACE) continue;

    const line = token.line - 1;
    const col = Math.max(0, token.column - 1);
    const length = token.value.length;
    const typeIdx = tokenTypeToIndex(token.type, token.value, state);

    let deltaLine = line - prevLine;
    let deltaChar = deltaLine === 0 ? col - prevChar : col;

    if (typeIdx === -1) continue;

    data.push(deltaLine, deltaChar, length, typeIdx, 0);
    prevLine = line;
    prevChar = col;
  }

  return { data };
}

// ── Hover ─────────────────────────────────────────────────────────────────

function findTokenAtPosition(
  tokens: Token[],
  pos: Position
): Token | undefined {
  const line = pos.line + 1;
  const col = pos.character + 1;
  for (const token of tokens) {
    if (token.type === TokenType.EOF) continue;
    if (
      token.line === line &&
      token.column <= col &&
      col <= token.column + token.value.length
    ) {
      return token;
    }
  }
  return undefined;
}

function findModelAtPosition(
  ast: SchemaNode,
  pos: Position
): ModelNode | undefined {
  const line = pos.line + 1;
  return ast.models.find((m) => m.line === line);
}

function findFieldAtPosition(
  model: ModelNode,
  pos: Position
): FieldNode | undefined {
  const line = pos.line + 1;
  return model.fields.find((f) => f.line === line);
}

function handleHover(params: any): any {
  const state = store.get(params.textDocument.uri);
  if (!state || !state.ast) return null;

  const pos = params.position;
  const token = findTokenAtPosition(state.tokens, pos);

  if (!token) return null;

  let content = "";

  // Check if token is a model name
  const model = state.ast.models.find((m) => m.name === token.value);
  if (model) {
    const fields = model.fields
      .map((f) => {
        const decorators = [
          f.isPrimaryKey && "@primary_key",
          f.isUnique && "@unique",
          f.isRequired && "@required",
          f.relation && `@${f.relation.type}`,
          f.defaultValue && `@default(...)`,
        ]
          .filter(Boolean)
          .join(" ");
        const arr = f.isArray ? "[]" : "";
        return `  ${f.name}: ${f.fieldType}${arr} ${decorators}`.trim();
      })
      .join("\n");
    content = `**model ${model.name}**\n\`\`\`\n${fields}\n\`\`\``;
  }

  // Check if token is a field name in context of its model
  for (const m of state.ast.models) {
    const field = m.fields.find((f) => f.name === token.value);
    if (field) {
      const arr = field.isArray ? "[]" : "";
      const decorators = [
        field.isPrimaryKey && "@primary_key",
        field.isUnique && "@unique",
        field.isRequired && "@required",
        field.isNullable && "?",
        field.relation && `@${field.relation.type}`,
        field.defaultValue !== undefined && `@default(...)`,
      ]
        .filter(Boolean)
        .join(" ");
      content = `**${m.name}.${field.name}**: \`${field.fieldType}${arr}\` ${decorators}`;
      if (field.relation?.foreignKey) {
        content += `\nFK: \`${field.relation.foreignKey}\``;
      }
      break;
    }
  }

  // Check if token is an enum name
  const enumNode = state.ast.enums?.find((e) => e.name === token.value);
  if (enumNode) {
    const values = enumNode.values.map((v) => `  \`${v}\``).join("\n");
    content = `**enum ${enumNode.name}**\n${values}`;
  }

  // Check if it's a type keyword
  if (["int", "string", "float", "boolean", "datetime", "json"].includes(token.value)) {
    content = `**${token.value}** scalar type`;
  }

  // Decorator info
  const decoratorDocs: Record<string, string> = {
    primary_key: "Marks this field as the primary key",
    unique: "Ensures all values in this field are unique",
    required: "This field is required (not nullable)",
    default: "Sets a default value for this field",
    one_to_one: "Defines a one-to-one relationship",
    many_to_one: "Defines a many-to-one relationship (foreign key on this model)",
    one_to_many: "Defines a one-to-many relationship (foreign key on the other model)",
    many_to_many: "Defines a many-to-many relationship (creates a join table)",
  };

  const decoMatch = token.value.match(/^@?(\w+)/);
  if (decoMatch && decoratorDocs[decoMatch[1]]) {
    content = `**@${decoMatch[1]}** — ${decoratorDocs[decoMatch[1]]}`;
  }

  if (!content) return null;

  return {
    contents: {
      kind: "markdown",
      value: content,
    },
  };
}

// ── Completion ─────────────────────────────────────────────────────────────

function handleCompletion(params: any): any {
  const state = store.get(params.textDocument.uri);
  if (!state) return { isIncomplete: false, items: [] };

  const pos = params.position;
  const line = pos.line + 1;

  // Find tokens on this line
  const tokensOnLine = state.tokens.filter(
    (t) => t.line === line && t.type !== TokenType.EOF
  );

  const lastToken = tokensOnLine[tokensOnLine.length - 1];
  const prevToken = tokensOnLine[tokensOnLine.length - 2];

  const items: any[] = [];

  // After `@` → suggest decorators
  if (lastToken?.type === TokenType.AT) {
    const decorators = [
      "primary_key",
      "unique",
      "required",
      "default()",
      "one_to_one()",
      "many_to_one()",
      "one_to_many",
      "many_to_many",
    ];
    for (const d of decorators) {
      const detail = d.includes("(") ? d.slice(0, -1) : d;
      items.push({
        label: d,
        kind: 14,
        detail,
        insertText: d,
      });
    }
    return { isIncomplete: false, items };
  }

  // After field name + space → suggest field types
  if (prevToken?.type === TokenType.IDENTIFIER && lastToken?.type === TokenType.IDENTIFIER) {
    // This is likely a field name followed by type/relation
    const types = ["int", "string", "float", "boolean", "datetime", "json"];
    // Add model names as relation targets
    const modelNames = state.ast?.models.map((m) => m.name) ?? [];
    // Add enum names
    const enumNames = state.ast?.enums?.map((e) => e.name) ?? [];
    for (const t of [...types, ...modelNames, ...enumNames]) {
      items.push({
        label: t,
        kind: t === "json" ? 14 : 9,
        detail: t === "json" ? "JSON object type (requires { })" : `field type: ${t}`,
        insertText: t,
      });
    }
    return { isIncomplete: false, items };
  }

  // Inside decorator parent → suggest default values
  if (lastToken?.value === "(") {
    if (prevToken?.value === "default") {
      items.push(
        { label: "autoincrement()", kind: 14, detail: "Auto-incrementing integer" },
        { label: "uuid()", kind: 14, detail: "Auto-generated UUID" },
        { label: "now()", kind: 14, detail: "Current timestamp" },
        { label: "true", kind: 12, detail: "Boolean true" },
        { label: "false", kind: 12, detail: "Boolean false" },
      );
      return { isIncomplete: false, items };
    }
    if (prevToken?.value === "one_to_one" || prevToken?.value === "many_to_one") {
      // Suggest field names for foreign key
      if (state.ast) {
        // Find the model being referenced and suggest its PK field
        for (const m of state.ast.models) {
          // This is heuristic - we'd need more context to know which model
          items.push({
            label: `${m.name}_id`,
            kind: 6,
            detail: `Foreign key to ${m.name}`,
          });
        }
      }
      return { isIncomplete: false, items };
    }
  }

  return { isIncomplete: false, items };
}

// ── Document Symbols ───────────────────────────────────────────────────────

function handleDocumentSymbol(params: any): any {
  const state = store.get(params.textDocument.uri);
  if (!state || !state.ast) return [];

  const symbols: any[] = [];

  for (const enumNode of state.ast.enums ?? []) {
    const children = enumNode.values.map((v) => ({
      name: v,
      kind: 21,
      range: {
        start: { line: enumNode.line - 1, character: 0 },
        end: { line: enumNode.line - 1, character: v.length },
      },
      selectionRange: {
        start: { line: enumNode.line - 1, character: 0 },
        end: { line: enumNode.line - 1, character: v.length },
      },
    }));

    symbols.push({
      name: enumNode.name,
      kind: 13,
      range: {
        start: { line: enumNode.line - 1, character: Math.max(0, enumNode.column - 1) },
        end: { line: enumNode.line - 1, character: enumNode.column + enumNode.name.length - 1 },
      },
      selectionRange: {
        start: { line: enumNode.line - 1, character: Math.max(0, enumNode.column - 1) },
        end: { line: enumNode.line - 1, character: enumNode.column + enumNode.name.length - 1 },
      },
      children,
    });
  }

  for (const model of state.ast.models) {
    const children = model.fields.map((f) => ({
      name: f.name,
      kind: 8,
      range: {
        start: { line: f.line - 1, character: Math.max(0, f.column - 1) },
        end: { line: f.line - 1, character: f.column + f.name.length - 1 },
      },
      selectionRange: {
        start: { line: f.line - 1, character: Math.max(0, f.column - 1) },
        end: { line: f.line - 1, character: f.column + f.name.length - 1 },
      },
    }));

    symbols.push({
      name: model.name,
      kind: 5,
      range: {
        start: { line: model.line - 1, character: Math.max(0, model.column - 1) },
        end: { line: model.line - 1, character: model.column + model.name.length - 1 },
      },
      selectionRange: {
        start: { line: model.line - 1, character: Math.max(0, model.column - 1) },
        end: { line: model.line - 1, character: model.column + model.name.length - 1 },
      },
      children,
    });
  }

  return symbols;
}

// ── Go to Definition ───────────────────────────────────────────────────────

function handleDefinition(params: any): any {
  const state = store.get(params.textDocument.uri);
  if (!state || !state.ast) return null;

  const pos = params.position;
  const token = findTokenAtPosition(state.tokens, pos);
  if (!token) return null;

  // If token references an enum name, go to that enum's definition
  const enumNode = state.ast.enums?.find((e) => e.name === token.value);
  if (enumNode) {
    return {
      uri: params.textDocument.uri,
      range: {
        start: { line: enumNode.line - 1, character: Math.max(0, enumNode.column - 1) },
        end: { line: enumNode.line - 1, character: enumNode.column + enumNode.name.length - 1 },
      },
    };
  }

  // If token references a model name, go to that model's definition
  const model = state.ast.models.find((m) => m.name === token.value);
  if (model) {
    return {
      uri: params.textDocument.uri,
      range: {
        start: { line: model.line - 1, character: Math.max(0, model.column - 1) },
        end: { line: model.line - 1, character: model.column + model.name.length - 1 },
      },
    };
  }

  return null;
}

// ── Message Handler ────────────────────────────────────────────────────────

function handleMessage(msg: LspMessage): void {
  const method = msg.method;

  switch (method) {
    case "initialize":
      sendMessage({ jsonrpc: "2.0", id: msg.id, result: handleInitialize(msg.params) });
      break;
    case "initialized":
      break;
    case "textDocument/didOpen":
      handleDidOpen(msg.params);
      break;
    case "textDocument/didChange":
      handleDidChange(msg.params);
      break;
    case "textDocument/didClose":
      handleDidClose(msg.params);
      break;
    case "textDocument/semanticTokens/full":
      sendMessage({
        jsonrpc: "2.0",
        id: msg.id,
        result: handleSemanticTokens(msg.params),
      });
      break;
    case "textDocument/completion":
      sendMessage({
        jsonrpc: "2.0",
        id: msg.id,
        result: handleCompletion(msg.params),
      });
      break;
    case "textDocument/hover":
      sendMessage({
        jsonrpc: "2.0",
        id: msg.id,
        result: handleHover(msg.params),
      });
      break;
    case "textDocument/documentSymbol":
      sendMessage({
        jsonrpc: "2.0",
        id: msg.id,
        result: handleDocumentSymbol(msg.params),
      });
      break;
    case "textDocument/definition":
      sendMessage({
        jsonrpc: "2.0",
        id: msg.id,
        result: handleDefinition(msg.params),
      });
      break;
    case "shutdown":
      sendMessage({ jsonrpc: "2.0", id: msg.id, result: null });
      process.exit(0);
    case "exit":
      process.exit(0);
      break;
    default:
      if (msg.id !== undefined) {
        sendMessage({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
      }
  }
}

// ── STDIN Reader (JSON-RPC framing) ───────────────────────────────────────

let buffer = "";

process.stdin.on("data", (chunk: Buffer) => {
  buffer += chunk.toString();

  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEnd + 4;

    if (buffer.length < bodyStart + contentLength) break;

    const body = buffer.slice(bodyStart, bodyStart + contentLength);
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const msg = JSON.parse(body) as LspMessage;
      handleMessage(msg);
    } catch (e) {
      // Ignore parse errors
    }
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});
