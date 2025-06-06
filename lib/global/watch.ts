import { exec } from "child_process";
import chokidar from "chokidar";

function runCommands() {
  exec(
    "bun run lib/utils/generate-injection.ts && bun run src/app.ts",
    (err, stdout, stderr) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log(stdout);
      console.error(stderr);
    }
  );
}

// Run once immediately
runCommands();

// Watch and rerun on changes
const watcher = chokidar.watch("src/**/*.ts");
watcher.on("change", () => {
  console.log("File changed, rerunning...");
  runCommands();
});
