import fs from "fs";
import path from "path";

const testFile = path.resolve(
  process.cwd(),
  "scripts/testAdminIntegration.mjs"
);

console.log("\n════════════════════════════════════════════");
console.log(" DUMPING ADMIN INTEGRATION TOKEN TEST LOGIC");
console.log("════════════════════════════════════════════\n");

if (!fs.existsSync(testFile)) {
  console.log("❌ Could not find scripts/testAdminIntegration.mjs");
  process.exit(1);
}

const content = fs.readFileSync(testFile, "utf8");

const lines = content.split("\n");

// Find the block that tests token_usage
const indexes = [];

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("token_usage")) {
    indexes.push(i);
  }
}

if (indexes.length === 0) {
  console.log("❌ No token_usage references found in test harness.");
  process.exit(0);
}

console.log("Found token_usage references at line(s):", indexes, "\n");

indexes.forEach((idx) => {
  console.log("--------------");
  console.log(`Context around line ${idx}:`);
  console.log(lines[idx - 3] || "");
  console.log(lines[idx - 2] || "");
  console.log(lines[idx - 1] || "");
  console.log(lines[idx] || "");
  console.log(lines[idx + 1] || "");
  console.log(lines[idx + 2] || "");
  console.log(lines[idx + 3] || "");
});

console.log("\n");

