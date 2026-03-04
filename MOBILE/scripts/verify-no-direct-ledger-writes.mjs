/**
 * Ledger Write Firewall Verification
 *
 * Scans the codebase for any direct writes to token_usage or token_topups tables.
 * Direct writes are now forbidden; all mutations must go through SECURITY DEFINER
 * functions (atomic_token_deduct, atomic_token_refund, atomic_stripe_webhook_process).
 *
 * Usage: node MOBILE/scripts/verify-no-direct-ledger-writes.mjs
 *
 * Exit codes:
 *   0 = No violations found (PASS)
 *   1 = Violations found (FAIL)
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

const ROOT_DIR = resolve(process.cwd(), "MOBILE");
const EXCLUDED_DIRS = ["node_modules", ".next", "dist", "build", "supabase", "scripts"];
const EXCLUDED_FILES = [".d.ts"];

// Patterns that indicate actual DML operations (not type imports or SELECT)
const VIOLATION_PATTERNS = [
  // Direct table mutations via Supabase client
  // Must be followed by insert/update/upsert/delete (not select)
  /\.from\s*\(\s*["\']token_usage["\']\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/,
  /\.from\s*\(\s*["\']token_topups["\']\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/,
  // Raw SQL mutations
  /token_usage.*\b(insert|update|delete)\s+into\b/i,
  /token_topups.*\b(insert|update|delete)\s+into\b/i,
];

// Patterns that are allowed (not actual writes)
const ALLOWED_PATTERNS = [
  // Type imports only
  /type\s+\w+\s*=\s*Database\["public"\]\["Tables"\]\["token_usage"\]/,
  /type\s+\w+\s*=\s*Database\["public"\]\["Tables"\]\["token_topups"\]/,
  // SELECT queries are allowed (reads not writes)
  /\.from\s*\(\s*["\']token_usage["\']\s*\)\s*\.\s*select\s*\(/,
  /\.from\s*\(\s*["\']token_topups["\']\s*\)\s*\.\s*select\s*\(/,
];

const ALLOWLIST_FILES = [
  // Migrations are allowed to create/alter tables
  /supabase\/migrations\/.*\.sql$/,
  /rebuild_migration_engine\.sql$/,
  // Test files that intentionally test the firewall
  /test-ledger-write-firewall\.mjs$/,
  /test-token-idempotency-retry\.mjs$/,
];

const violations = [];

function isAllowedFile(filePath) {
  return ALLOWLIST_FILES.some((pattern) => pattern.test(filePath));
}

function isExcludedDir(dirPath) {
  return EXCLUDED_DIRS.some((excluded) => dirPath.includes(excluded));
}

function isTargetFile(filePath) {
  if (EXCLUDED_FILES.some((excluded) => filePath.endsWith(excluded))) {
    return false;
  }
  return filePath.endsWith(".ts") || filePath.endsWith(".tsx") || filePath.endsWith(".mjs") || filePath.endsWith(".js");
}

function isAllowedPattern(line) {
  return ALLOWED_PATTERNS.some((pattern) => pattern.test(line));
}

function scanFile(filePath) {
  if (isAllowedFile(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*")) {
      return;
    }

    // Skip if matches allowed patterns (type imports, SELECT queries)
    if (isAllowedPattern(line)) {
      return;
    }

    VIOLATION_PATTERNS.forEach((pattern) => {
      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: index + 1,
          code: line.trim(),
        });
      }
    });
  });
}

function scanDirectory(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!isExcludedDir(fullPath)) {
        scanDirectory(fullPath);
      }
    } else if (isTargetFile(fullPath)) {
      scanFile(fullPath);
    }
  }
}

// Main
console.log("\n========================================");
console.log("LEDGER WRITE FIREWALL VERIFICATION");
console.log("========================================\n");
console.log("Scanning for direct writes to token_usage or token_topups...");
console.log(`Root directory: ${ROOT_DIR}\n`);
console.log("Allowed: SELECT queries (read-only)");
console.log("Allowed: Type imports (no runtime effect)");
console.log("Blocked: INSERT, UPDATE, UPSERT, DELETE\n");

try {
  scanDirectory(ROOT_DIR);
} catch (err) {
  console.error(`Error scanning: ${err.message}`);
  process.exit(1);
}

// Report results
console.log("\n----------------------------------------");
console.log("SCAN RESULTS");
console.log("----------------------------------------\n");

if (violations.length === 0) {
  console.log("✅ PASS: No direct ledger writes found");
  console.log("\nAll token mutations go through SECURITY DEFINER functions:");
  console.log("  - atomic_token_deduct()");
  console.log("  - atomic_token_refund()");
  console.log("  - atomic_stripe_webhook_process()");
  console.log("\nDirect table writes are blocked at the database level (RLS + REVOKE).");
  process.exit(0);
} else {
  console.log(`❌ FAIL: ${violations.length} direct ledger write(s) found\n`);
  console.log("The following code bypasses the ledger write firewall:\n");

  violations.forEach((v, i) => {
    console.log(`${i + 1}. ${v.file}:${v.line}`);
    console.log(`   Code: ${v.code}`);
    console.log("");
  });

  console.log("\nFIX REQUIRED:");
  console.log("Replace direct table writes with SECURITY DEFINER RPC calls:");
  console.log("  - Instead of: supabase.from('token_usage').insert(...)");
  console.log("  - Use: supabase.rpc('atomic_token_deduct', {...})");
  console.log("  - Or: supabase.rpc('atomic_token_refund', {...})");
  console.log("\nThe database firewall blocks all direct DML on these tables.");
  process.exit(1);
}
