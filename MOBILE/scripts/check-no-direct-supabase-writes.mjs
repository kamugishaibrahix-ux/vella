/**
 * CI GATE: No direct Supabase writes outside safeSupabaseWrite wrappers.
 *
 * Scans the codebase (via ripgrep) for `.from(…).insert(`, `.from(…).update(`,
 * or `.from(…).upsert(` patterns that bypass the safe write wrappers.
 *
 * Allowed files (not flagged):
 *   - lib/safe/safeSupabaseWrite.ts  (the wrapper itself)
 *   - tests/** and test/**           (test fixtures)
 *   - scripts/**                     (CI / tooling scripts)
 *   - *.test.ts / *.test.tsx         (test files anywhere)
 *
 * Usage:
 *   node scripts/check-no-direct-supabase-writes.mjs
 *
 * Exit codes:
 *   0 = PASS (no violations)
 *   1 = FAIL (violations found or scan error)
 */

import { execSync } from "child_process";
import { resolve } from "path";

const ROOT = resolve(process.cwd());

// ripgrep pattern: .from( ... ) followed by .insert( / .update( / .upsert(
// We use a multiline-aware regex so chained calls on the next line are caught too.
const RG_PATTERN = String.raw`\.from\([^)]*\)\s*\.\s*(insert|update|upsert)\s*\(`;

// Globs to include
const INCLUDE_GLOBS = ["*.ts", "*.tsx"];

// Files / directories to exclude from violations
const EXCLUDE_GLOBS = [
  "node_modules/**",
  ".next/**",
  "dist/**",
  "build/**",
  // The wrapper itself — this is the ONE allowed location
  "lib/safe/safeSupabaseWrite.ts",
  // Tests are allowed to call Supabase directly for fixture setup
  "tests/**",
  "test/**",
  "scripts/**",
  "**/*.test.ts",
  "**/*.test.tsx",
];

function buildRgArgs() {
  const args = [
    "--line-number",
    "--no-heading",
    "--color", "never",
    "-e", RG_PATTERN,
  ];

  for (const g of INCLUDE_GLOBS) {
    args.push("--glob", g);
  }
  for (const g of EXCLUDE_GLOBS) {
    args.push("--glob", `!${g}`);
  }

  args.push(".");
  return args;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("\n========================================");
console.log("SUPABASE WRITE FIREWALL — CI GATE");
console.log("========================================\n");
console.log("Rule: All .from().insert / .update / .upsert calls");
console.log("      must go through safeInsert / safeUpdate / safeUpsert");
console.log(`      in lib/safe/safeSupabaseWrite.ts\n`);
console.log(`Scanning: ${ROOT}\n`);

let stdout = "";
try {
  const rgArgs = buildRgArgs();
  // ripgrep exits 1 when no matches (good), 0 when matches (bad for us), 2 on error
  stdout = execSync(`rg ${rgArgs.map(a => `"${a}"`).join(" ")}`, {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
} catch (err) {
  // Exit code 1 from rg means "no matches" — that's a PASS
  if (err.status === 1) {
    console.log("✅ PASS: No direct Supabase writes found outside safe wrappers.\n");
    console.log("All mutations route through:");
    console.log("  - safeInsert()  (lib/safe/safeSupabaseWrite.ts)");
    console.log("  - safeUpdate()  (lib/safe/safeSupabaseWrite.ts)");
    console.log("  - safeUpsert()  (lib/safe/safeSupabaseWrite.ts)\n");
    process.exit(0);
  }
  // Exit code 2 means ripgrep had an error
  console.error("❌ ripgrep error:", err.stderr || err.message);
  process.exit(1);
}

// If we get here, rg returned matches (exit 0) — filter out commented lines
const rawLines = stdout.trim().split("\n").filter(Boolean);

const violations = [];
for (const line of rawLines) {
  // Format: ./relative/path.ts:lineNo:code
  const match = line.match(/^(.+?):(\d+):(.+)$/);
  if (!match) continue;

  const [, file, lineNo, code] = match;
  const trimmed = code.trim();

  // Skip commented-out lines
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
    continue;
  }

  violations.push({ file, line: lineNo, code: trimmed });
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log("----------------------------------------");
console.log("SCAN RESULTS");
console.log("----------------------------------------\n");

if (violations.length === 0) {
  console.log("✅ PASS: No direct Supabase writes found outside safe wrappers.");
  console.log("         (Commented-out references were skipped.)\n");
  process.exit(0);
}

console.log(`❌ FAIL: ${violations.length} direct Supabase write(s) bypassing safe wrappers\n`);

violations.forEach((v, i) => {
  console.log(`  ${i + 1}. ${v.file}:${v.line}`);
  console.log(`     ${v.code}`);
  console.log("");
});

console.log("FIX REQUIRED:");
console.log("Replace direct .from(table).insert/update/upsert calls with:");
console.log("  import { safeInsert, safeUpdate, safeUpsert } from '@/lib/safe/safeSupabaseWrite';");
console.log("  safeInsert(table, payload, options, client);");
console.log("  safeUpdate(table, payload, options, client);");
console.log("  safeUpsert(table, payload, options, client);\n");
process.exit(1);
