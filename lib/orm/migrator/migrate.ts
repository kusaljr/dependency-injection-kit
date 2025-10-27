import { SQL } from "bun";
import { SchemaNode } from "../core/ast";
import { fetchSchemaAstFromDb } from "./introspection";
import { SqlGenerator } from "./migration-generator";

// Create the SQL client using DATABASE_URL
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("❌ DATABASE_URL is not set in environment variables.");
}

const sql = new SQL({
  url: dbUrl,
});

export async function migrate(ast: SchemaNode) {
  const sqlGenerator = new SqlGenerator(ast, "postgresql");
  const previousAst = await fetchSchemaAstFromDb(sql); // pass the SQL client

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
    return;
  }

  console.log("\n--- Generated Migration SQL ---");
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
    throw err;
  }
}
