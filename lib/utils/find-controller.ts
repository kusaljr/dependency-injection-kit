import * as fs from "fs";
import * as path from "path";

export function findControllerFiles(dir: string): string[] {
  let controllerFiles: string[] = [];

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      controllerFiles = controllerFiles.concat(findControllerFiles(fullPath));
    } else if (
      file.endsWith(".controller.ts") ||
      file.endsWith(".controller.js")
    ) {
      controllerFiles.push(fullPath);
    }
  }
  return controllerFiles;
}
