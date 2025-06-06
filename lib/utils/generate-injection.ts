import "reflect-metadata";

import * as fs from "fs";
import { minimatch } from "minimatch";
import * as path from "path";
import * as ts from "typescript";
import { SOCKET_METADATA_KEY } from "../ops/socket/decorator";

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const SERVICES_DIR = path.join(PROJECT_ROOT, "src");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "lib/global/injection.ts");

// Define paths to exclude from scanning
const EXCLUDED_PATTERNS = [
  "**/*.spec.ts",
  "src/app.ts",
  "lib/utils/generate-injection.ts",
  "lib/global/injection.ts",
  "**/*.dto.ts",
];

function isExcluded(filePath: string): boolean {
  const relativePath = path
    .relative(PROJECT_ROOT, filePath)
    .replace(/\\/g, "/");
  return EXCLUDED_PATTERNS.some((pattern) => minimatch(relativePath, pattern));
}

const CONTAINER_RELATIVE_PATH = path
  .relative(
    path.dirname(OUTPUT_FILE),
    path.join(PROJECT_ROOT, "lib/global/container")
  )
  .replace(/\\/g, "/");

function findInjectableFiles(dir: string): string[] {
  let injectableFiles: string[] = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      injectableFiles = injectableFiles.concat(findInjectableFiles(fullPath));
    } else if (
      (file.endsWith(".ts") || file.endsWith(".gateway.ts")) &&
      !file.endsWith(".d.ts") &&
      !isExcluded(fullPath)
    ) {
      injectableFiles.push(path.resolve(fullPath));
    }
  }

  return injectableFiles;
}

function parseImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.ES2015,
    true
  );
  const imports: string[] = [];

  sourceFile.forEachChild((node) => {
    if (ts.isImportDeclaration(node)) {
      const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
      if (!specifier.startsWith(".")) return;

      const resolvedPath = path.resolve(
        path.dirname(filePath),
        specifier + ".ts"
      );
      if (fs.existsSync(resolvedPath)) imports.push(resolvedPath);
    }
  });

  return imports;
}

function buildFileDependencyGraph(files: string[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const file of files) {
    const deps = parseImports(file).filter((f) => files.includes(f));
    graph.set(file, new Set(deps));
  }

  return graph;
}

function topologicalSortFiles(graph: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const temp = new Set<string>();
  const sorted: string[] = [];

  function visit(file: string) {
    if (visited.has(file)) return;
    if (temp.has(file))
      throw new Error(`Cyclic dependency detected in ${file}`);
    temp.add(file);
    for (const dep of graph.get(file) || []) {
      visit(dep);
    }
    temp.delete(file);
    visited.add(file);
    sorted.push(file);
  }

  for (const file of graph.keys()) {
    if (!visited.has(file)) visit(file);
  }

  return sorted;
}

function preloadFilesInOrder(files: string[]) {
  for (const file of files) {
    try {
      delete require.cache[file];
      require(file);
    } catch (err) {
      console.warn(
        `Warning: Failed to preload ${file}`,
        (err as { message: string }).message
      );
    }
  }
}

function generateInjectionFile() {
  const sourceFiles = findInjectableFiles(SERVICES_DIR);

  // 🔁 Preload all source files in dependency-safe order
  const graph = buildFileDependencyGraph(sourceFiles);
  const sortedFiles = topologicalSortFiles(graph);
  preloadFilesInOrder(sortedFiles);

  // 🔍 Now scan only injectable/gateway files
  let imports: string[] = [];
  let registrations: string[] = [];
  let exports: string[] = [];

  registrations.push(
    `import { Container } from './${CONTAINER_RELATIVE_PATH}';`
  );
  registrations.push("");
  registrations.push("const container = Container.getInstance();");
  registrations.push("");

  const classMap: Map<string, any> = new Map();
  const importMap: Map<string, string> = new Map();
  const dependencyGraph: Map<string, Set<string>> = new Map();

  for (const filePath of sortedFiles) {
    try {
      const module = require(filePath);

      for (const key of Object.keys(module)) {
        const ClassRef = module[key];
        if (typeof ClassRef !== "function") continue;

        const isInjectable = Reflect.getMetadata("injectable", ClassRef);
        const isSocket = Reflect.getMetadata(SOCKET_METADATA_KEY, ClassRef);
        if (!isInjectable && !isSocket) continue;

        const relativeImportPath = path
          .relative(path.dirname(OUTPUT_FILE), filePath.replace(/\.ts$/, ""))
          .replace(/\\/g, "/");

        imports.push(`import { ${key} } from '${relativeImportPath}';`);
        classMap.set(key, ClassRef);
        importMap.set(key, relativeImportPath);

        const paramTypes: any[] =
          Reflect.getMetadata("design:paramtypes", ClassRef) || [];
        const deps = new Set<string>();

        for (const dep of paramTypes) {
          if (typeof dep === "function" && dep.name !== "Object") {
            deps.add(dep.name);
          }
        }

        dependencyGraph.set(key, deps);
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  function topologicalSortClasses(graph: Map<string, Set<string>>): string[] {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const sorted: string[] = [];

    function visit(node: string) {
      if (visited.has(node)) return;
      if (temp.has(node))
        throw new Error(`Cyclic dependency detected at ${node}`);

      temp.add(node);
      for (const dep of graph.get(node) || []) {
        if (graph.has(dep)) visit(dep);
      }
      temp.delete(node);
      visited.add(node);
      sorted.push(node);
    }

    for (const node of graph.keys()) {
      if (!visited.has(node)) visit(node);
    }

    return sorted;
  }

  const sortedKeys = topologicalSortClasses(dependencyGraph);
  imports = Array.from(new Set(imports)).sort();

  for (const key of sortedKeys) {
    registrations.push(`container.register(${key});`);
    exports.push(
      `export const ${
        key.charAt(0).toLowerCase() + key.slice(1)
      } = container.resolve(${key});`
    );
  }

  const fileContent = [
    `// This file is auto-generated by the injection watcher. Do not modify manually.`,
    `// It registers all @Injectable and @Socket classes with the DI container.`,
    `// Generated on: ${new Date().toISOString()}`,
    "",
    ...imports,
    "",
    ...registrations,
    "",
    ...exports,
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, fileContent);

  console.log(
    `Generated ${OUTPUT_FILE} with ${exports.length} injectable services or gateways.`
  );
}

generateInjectionFile();
