#!/usr/bin/env node
/**
 * SECURITY: Secrets hygiene check.
 * Scans tracked files for hard-coded secret patterns.
 * Fails with a clear message if found. Does NOT scan node_modules or build outputs.
 *
 * Run before commit: node scripts/check_secrets_hygiene.mjs
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Patterns that indicate hard-coded secrets (variable assignment with value)
// Do NOT include the value in output — only report file and line.
const SECRET_PATTERNS = [
  { name: "OPENAI_API_KEY", regex: /OPENAI_API_KEY\s*=\s*['"]?sk-/i },
  { name: "SUPABASE_SERVICE_ROLE_KEY", regex: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?eyJ/i },
  { name: "STRIPE_SECRET_KEY", regex: /STRIPE_SECRET_KEY\s*=\s*['"]?sk_(live|test)_/i },
  { name: "STRIPE_WEBHOOK_SECRET", regex: /STRIPE_WEBHOOK_SECRET\s*=\s*['"]?whsec_/i },
  { name: "SUPABASE_DATABASE_PASSWORD", regex: /SUPABASE_DATABASE_PASSWORD\s*=\s*['"][^'"]+['"]/i },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", regex: /NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*['"]?eyJ/i },
];

// Paths to exclude (same as .gitignore concepts)
const EXCLUDE_PREFIXES = [
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  "out/",
  ".git/",
];

function getTrackedFiles() {
  try {
    const out = execSync("git ls-files", { cwd: ROOT, encoding: "utf-8" });
    return out.trim().split("\n").filter(Boolean);
  } catch (e) {
    console.error("[check_secrets_hygiene] Not a git repo or git unavailable:", e.message);
    process.exit(2);
  }
}

function shouldExclude(file) {
  const normalized = file.replace(/\\/g, "/");
  return EXCLUDE_PREFIXES.some((prefix) => normalized.startsWith(prefix) || normalized.includes("/" + prefix));
}

function scanFile(filePath) {
  const hits = [];
  const fullPath = join(ROOT, filePath);
  if (!existsSync(fullPath)) return hits;
  let content;
  try {
    content = readFileSync(fullPath, "utf-8");
  } catch {
    return hits;
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { name, regex } of SECRET_PATTERNS) {
      if (regex.test(line)) {
        hits.push({ file: filePath, lineNum: i + 1, pattern: name });
      }
    }
  }
  return hits;
}

function main() {
  const files = getTrackedFiles().filter((f) => !shouldExclude(f));
  const allHits = [];
  for (const file of files) {
    allHits.push(...scanFile(file));
  }
  if (allHits.length > 0) {
    console.error("[check_secrets_hygiene] FAIL: Hard-coded secrets detected in tracked files.\n");
    for (const { file, lineNum, pattern } of allHits) {
      console.error(`  ${file}:${lineNum} — ${pattern}`);
    }
    console.error("\nRemove secrets from tracked files. Use environment variables instead.");
    console.error("See SECURITY_HARDENING_PLAN.md Phase 5 for secrets hygiene.");
    process.exit(1);
  }
  console.log("[check_secrets_hygiene] OK — no hard-coded secrets found in tracked files.");
}

main();
