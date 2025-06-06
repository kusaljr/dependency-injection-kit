import "reflect-metadata";

import * as fs from "fs";
import { minimatch } from "minimatch";
import * as path from "path";
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

// Helper to check if a file should be excluded
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

export function findInjectableFiles(dir: string): string[] {
  let injectableFiles: string[] = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      injectableFiles = injectableFiles.concat(findInjectableFiles(fullPath));
    } else if (
      (file.endsWith(".ts") || file.endsWith(".gateway.ts")) &&
      !file.endsWith(".d.ts")
    ) {
      if (!isExcluded(fullPath)) {
        injectableFiles.push(fullPath);
      }
    }
  }

  return injectableFiles;
}

function generateInjectionFile() {
  const injectableFiles = findInjectableFiles(SERVICES_DIR);
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

  for (const filePath of injectableFiles) {
    const absoluteFilePath = path.resolve(filePath);
    delete require.cache[absoluteFilePath];

    try {
      const module = require(absoluteFilePath);

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
        const dependencies = new Set<string>();

        // Add constructor dependencies
        for (const dep of paramTypes) {
          if (typeof dep === "function" && dep.name !== "Object") {
            dependencies.add(dep.name);
          }
        }

        // Add guards from @UseGuards decorator metadata

        // Collect guards from class-level metadata
        const classGuards: any[] =
          Reflect.getMetadata("guards", ClassRef) || [];

        // Collect guards from method-level metadata
        const methodNames = Object.getOwnPropertyNames(ClassRef.prototype);
        for (const methodName of methodNames) {
          if (methodName === "constructor") continue;
          const methodGuards: any[] =
            Reflect.getMetadata("guards", ClassRef.prototype, methodName) || [];
          classGuards.push(...methodGuards);
        }

        for (const guardClass of classGuards) {
          if (
            typeof guardClass === "function" &&
            guardClass.name !== "Object"
          ) {
            dependencies.add(guardClass.name);
          }
        }

        dependencyGraph.set(key, dependencies);
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  // Topological Sort
  function topologicalSort(graph: Map<string, Set<string>>): string[] {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const sorted: string[] = [];

    function visit(node: string) {
      if (visited.has(node)) return;
      if (temp.has(node)) {
        throw new Error(`Cyclic dependency detected at ${node}`);
      }

      temp.add(node);
      const deps = graph.get(node) || new Set();
      for (const dep of deps) {
        if (graph.has(dep)) visit(dep); // Only visit known classes
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

  const sortedKeys = topologicalSort(dependencyGraph);

  // Remove duplicate imports and sort
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
