import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function installPackagesTemporarily(pkgs: string[]) {
  for (const pkg of pkgs) {
    console.log(`📦 Installing ${pkg}...`);
    execSync(`bun add ${pkg} --no-save`, { stdio: "inherit" });
  }
}

function resolveInstalledVersion(pkgName: string): string | null {
  try {
    const pkgPath = require.resolve(`${pkgName}/package.json`, {
      paths: [process.cwd()],
    });
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkgJson.version;
  } catch {
    return null;
  }
}

function generateImportMap(pkgs: string[]): string {
  const imports: Record<string, string> = {};

  for (const pkg of pkgs) {
    const version = resolveInstalledVersion(pkg);
    if (version) {
      imports[pkg] = `https://esm.sh/${pkg}@${version}`;
    }
  }

  // Add special case for react-dom/client
  const reactDomVersion = resolveInstalledVersion("react-dom");
  if (reactDomVersion) {
    imports[
      "react-dom/client"
    ] = `https://esm.sh/react-dom@${reactDomVersion}/client`;
  }

  const importMap = {
    imports,
  };

  const outputPath = path.resolve("react-importmap.json");
  fs.writeFileSync(outputPath, JSON.stringify(importMap, null, 2), "utf8");
  console.log(`✅ Import map generated at ${outputPath}`);
  return outputPath;
}

// CLI usage: `bun run client-install.ts react-leaflet leaflet`
const userPackages = process.argv.slice(2);
if (userPackages.length === 0) {
  console.error("❌ Please specify packages to install");
  process.exit(1);
}

installPackagesTemporarily(userPackages);
generateImportMap(userPackages);
