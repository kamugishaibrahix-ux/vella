import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const MOBILE = join(ROOT, "MOBILE", "lib", "insights");

const files = [
  "behaviourLoops.ts",
  "lifeThemes.ts"
];

console.log("══════════════════════════════════════");
console.log(" INSIGHT GUARD DUMP (PHASE 11 DEBUG)");
console.log("══════════════════════════════════════\n");

files.forEach(file => {
  const p = join(MOBILE, file);
  console.log("\nFILE:", p);
  console.log("────────────────────────────");

  if (!existsSync(p)) {
    console.log("❌ File missing");
    return;
  }

  const content = readFileSync(p, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    if (line.includes("Not enough") ||
        line.includes("journals") ||
        line.includes("check-in") ||
        line.includes("summary")) {
      console.log(`${idx + 1}:`, line);
    }
  });
});

console.log("\nSCAN COMPLETE");

