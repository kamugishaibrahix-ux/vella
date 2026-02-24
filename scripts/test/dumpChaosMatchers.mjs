import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "scripts", "test");

function scanDirectory(dir) {
  const files = readdirSync(dir);
  const results = [];

  for (const f of files) {
    const full = join(dir, f);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      results.push(...scanDirectory(full));
    } else if (stat.isFile()) {
      results.push(full);
    }
  }

  return results;
}

const files = scanDirectory(ROOT);

console.log("════════════════════════════════");
console.log(" CHAOS MATCHER DUMP (PHASE 11)");
console.log("════════════════════════════════\n");

for (const file of files) {
  const content = readFileSync(file, "utf8");

  if (
    content.includes("behaviourLoops") ||
    content.includes("lifeThemes") ||
    content.includes("Scenario only_checkins") ||
    content.includes("Scenario only_journals")
  ) {
    console.log("FILE:", file);
    console.log("──────────────────────────────");

    const lines = content.split("\n");

    lines.forEach((line, index) => {
      if (
        line.includes("behaviourLoops") ||
        line.includes("lifeThemes") ||
        line.includes("only_checkins") ||
        line.includes("only_journals")
      ) {
        console.log(`(${index + 1}) ${line}`);
      }
    });

    console.log();
  }
}

console.log("SCAN COMPLETE");

