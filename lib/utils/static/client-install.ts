import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Installs specified packages temporarily using 'bun add --no-save'.
 * It checks if a package is already installed in node_modules to avoid re-installation.
 * @param pkgs An array of package names to install.
 */
function installPackagesTemporarily(pkgs: string[]): void {
  for (const pkg of pkgs) {
    const pkgNodeModulesPath = path.join(
      process.cwd(),
      "node_modules",
      pkg,
      "package.json"
    );
    if (fs.existsSync(pkgNodeModulesPath)) {
      console.log(`✅ ${pkg} already installed. Skipping installation.`);
      continue;
    }

    console.log(`📦 Installing ${pkg}...`);
    try {
      execSync(`bun add ${pkg} --no-save`, { stdio: "inherit" });
    } catch (error) {
      console.error(`❌ Failed to install ${pkg}:`, error);
      // Decide if you want to exit or continue with other packages
      // process.exit(1);
    }
  }
}

/**
 * Resolves the installed version of a given package by reading its package.json.
 * @param pkgName The name of the package.
 * @returns The version string if found, otherwise null.
 */
function resolveInstalledVersion(pkgName: string): string | null {
  try {
    // require.resolve looks for the module in paths like node_modules
    const pkgPath = require.resolve(`${pkgName}/package.json`, {
      paths: [process.cwd()], // Search from the current working directory
    });
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkgJson.version;
  } catch (e) {
    // This typically means the package or its package.json was not found.
    console.warn(
      `⚠️ Could not resolve version for ${pkgName}. It might not be installed or its package.json is missing.`
    );
    return null;
  }
}

/**
 * Generates or updates an import map file (`react-importmap.json`) with URLs for specified packages.
 * It reads an existing import map and merges new package entries into it, preserving previous entries.
 * Special handling for 'react-dom/client' is included.
 * @param pkgs An array of package names for which to generate import map entries.
 * @returns The path to the generated import map file.
 */
function generateImportMap(pkgs: string[]): string {
  const outputPath = path.resolve("react-importmap.json");
  let existingImportMap: { imports: Record<string, string> } = { imports: {} };

  // Try to read existing import map file
  if (fs.existsSync(outputPath)) {
    try {
      const fileContent = fs.readFileSync(outputPath, "utf8");
      const parsedContent = JSON.parse(fileContent);
      // Ensure the 'imports' property exists and is an object
      if (
        parsedContent &&
        typeof parsedContent.imports === "object" &&
        parsedContent.imports !== null
      ) {
        existingImportMap.imports = parsedContent.imports;
      } else {
        console.warn(
          `⚠️ Existing import map at ${outputPath} is malformed (missing or invalid 'imports' property). Starting with an empty map.`
        );
      }
    } catch (e) {
      console.warn(
        `⚠️ Could not parse existing import map at ${outputPath}. Creating a new one. Error: ${e}`
      );
      // Fallback to an empty map if parsing fails
      existingImportMap = { imports: {} };
    }
  }

  const newImports: Record<string, string> = {};

  // Generate import URLs for the requested packages
  for (const pkg of pkgs) {
    const version = resolveInstalledVersion(pkg);
    if (version) {
      newImports[pkg] = `https://esm.sh/${pkg}@${version}`;
    }
  }

  // Add special case for react-dom/client to map it correctly
  const reactDomVersion = resolveInstalledVersion("react-dom");
  if (reactDomVersion) {
    // This ensures react-dom/client is mapped to the client entry point of react-dom
    newImports[
      "react-dom/client"
    ] = `https://esm.sh/react-dom@${reactDomVersion}/client`;
  }

  // Merge new imports with existing ones. New imports (or updates for existing packages) take precedence.
  const mergedImports = { ...existingImportMap.imports, ...newImports };

  const importMap = {
    imports: mergedImports,
  };

  // Write the updated import map to the file
  try {
    fs.writeFileSync(outputPath, JSON.stringify(importMap, null, 2), "utf8");
    console.log(`✅ Import map generated/updated at ${outputPath}`);
  } catch (e) {
    console.error(`❌ Failed to write import map to ${outputPath}:`, e);
    process.exit(1); // Exit if we can't write the file
  }
  return outputPath;
}

// --- CLI Usage ---
// Example: `bun run client-install.ts react react-dom react-leaflet leaflet`

const userPackages = process.argv.slice(2); // Get arguments passed after the script name

if (userPackages.length === 0) {
  console.error(
    "❌ Please specify packages to install. Usage: `bun run client-install.ts <package1> <package2> ...`"
  );
  process.exit(1);
}

// 1. Install packages temporarily
installPackagesTemporarily(userPackages);

// 2. Generate/update the import map
generateImportMap(userPackages);
