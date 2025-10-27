import { SchemaNode } from "../core/ast";
import { migrate } from "../migrator/migrate";
import { ast } from "./ast";

migrate(ast as SchemaNode)
  .then(() => {
    console.log("\n✅ Migration completed successfully.");
  })
  .catch((err) => {
    console.error(
      "\n❌ Migration failed, exiting with error. Please check logs."
    );
    process.exit(1);
  });
