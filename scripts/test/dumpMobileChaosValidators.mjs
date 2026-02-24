import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "scripts", "test");

function scan(dir) {
  const files = readdirSync(dir);
  for (const f of files) {
    const full = join(dir, f);
    const stat = statSync(full);
    if (stat.isDirectory()) scan(full);
    else {
      const code = readFileSync(full, "utf8");
      if (
        code.includes("only_checkins") ||
        code.includes("only_journals") ||
        code.includes("behaviourLoops") ||
        code.includes("lifeThemes") ||
        code.includes("detectBehaviourLoops") ||
        code.includes("extractLifeThemes")
      ) {
        console.log("FILE:", full);
        console.log("────────────────────────────");
        const lines = code.split("\n");
        lines.forEach((line, idx) => {
          if (
            line.includes("only_checkins") ||
            line.includes("only_journals") ||
            line.includes("behaviourLoops") ||
            line.includes("lifeThemes") ||
            line.includes("detectBehaviourLoops") ||
            line.includes("extractLifeThemes")
          ) {
            console.log(`(${idx + 1}) ${line}`);
          }
        });
        console.log();
      }
    }
  }
}

console.log("══════════════════════════════════════");
console.log(" MOBILE CHAOS VALIDATION DUMP");
console.log("══════════════════════════════════════\n");

scan(ROOT);

console.log("SCAN COMPLETE\n");

