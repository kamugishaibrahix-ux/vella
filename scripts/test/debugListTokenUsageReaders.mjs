import fs from "fs";
import path from "path";

function walk(dir) {
  let results = [];
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (full.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

console.log("\n══════════════════════════════════════");
console.log("TOKEN USAGE ADMIN READER SCAN");
console.log("══════════════════════════════════════\n");

const root = path.resolve(process.cwd(), "apps/vella-control/app/api/admin");

const files = walk(root);

let found = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");

  if (content.includes("token_usage")) {
    found.push(file);
    console.log("FOUND:", file);
  }
}

if (found.length === 0) {
  console.log("❌ No admin reader for token_usage found anywhere.");
}

console.log("\nSCAN COMPLETE\n");

