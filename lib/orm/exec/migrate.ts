import * as fs from "fs";
import * as path from "path";
import { SQL } from "bun";
import { SchemaNode } from "../core/ast";
import { fetchSchemaAstFromDb } from "../migrator/introspection";
import { SqlGenerator } from "../migrator/migration-generator";
import { ast } from "./ast";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("❌ DATABASE_URL is not set in environment variables.");
  process.exit(1);
}

const sql = new SQL({ url: dbUrl });

async function generate(): Promise<string> {
  const sqlGenerator = new SqlGenerator(ast as SchemaNode, "postgresql");
  const previousAst = await fetchSchemaAstFromDb(sql);

  let migrationSQL: string;

  if (!previousAst || previousAst.models.length === 0) {
    console.log("\n--- No Previous Schema Found, Starting Fresh ---");
    migrationSQL = sqlGenerator.generateMigration(null);
  } else {
    console.log("\n--- Previous Schema Fetched Successfully ---");
    migrationSQL = sqlGenerator.generateMigration(previousAst);
  }

  if (migrationSQL.trim() === "-- No changes detected.") {
    console.log("\n✅ No migration needed.");
    return "";
  }

  const nonCommentLines = migrationSQL
    .split("\n")
    .filter(
      (l) =>
        !l.trim().startsWith("--") &&
        !l.trim().startsWith("BEGIN;") &&
        !l.trim().startsWith("COMMIT;") &&
        l.trim() !== ""
    );

  if (nonCommentLines.length === 0) {
    console.log("\n✅ No real changes — only warnings. Skipping.");
    return "";
  }

  const migrationsDir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const filename = `${timestamp}_migration.sql`;
  const filePath = path.join(migrationsDir, filename);

  fs.writeFileSync(filePath, migrationSQL, "utf8");
  console.log(`\n📝 Migration written to ${filePath}`);
  return filePath;
}

async function apply(): Promise<void> {
  const migrationsDir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.error("❌ No migrations directory found.");
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("\n✅ No migration files to apply.");
    return;
  }

  const latestFile = files[files.length - 1];
  const filePath = path.join(migrationsDir, latestFile);
  const migrationSQL = fs.readFileSync(filePath, "utf8");

  console.log(`\n--- Applying migration: ${latestFile} ---`);
  console.log(migrationSQL);

  try {
    console.log("\n🚀 Applying migration...");
    const reserved = await sql.reserve();
    try {
      await reserved.unsafe(migrationSQL);
      console.log("✅ Migration applied successfully.");
    } finally {
      reserved.release();
    }
  } catch (err) {
    console.error("❌ Failed to apply migration:", err);
    process.exit(1);
  }
}

const subcommand = process.argv[2] || "generate";

if (subcommand === "generate") {
  generate()
    .then((filePath) => {
      if (filePath) console.log("\n✅ Migration generated successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Failed to generate migration:", err);
      process.exit(1);
    });
} else if (subcommand === "apply") {
  apply()
    .then(() => {
      console.log("\n✅ Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Error:", err);
      process.exit(1);
    });
} else {
  console.error(
    '❌ Unknown subcommand. Usage: bun run orm:migrate generate | bun run orm:migrate apply'
  );
  process.exit(1);
}
