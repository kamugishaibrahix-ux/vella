#!/usr/bin/env node
/**
 * Phase 0 Lockdown CI: fail the build if server code bypasses safeSupabaseWrite
 * or logs request/response bodies.
 *
 * 1) Direct writes: fromSafe("...").(insert|update|upsert)( or supabase.from("...").(insert|update|upsert)(
 * 2) Body logging: console.log/error with req.body, request.body, res., response.
 *
 * Run from repo root; scans MOBILE (and optionally apps).
 */

import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import readline from "node:readline";

import { existsSync } from "node:fs";

const ROOT = process.cwd();
// When run from repo root: scan ROOT/MOBILE. When run from MOBILE: scan ROOT.
const MOBILE_DIR = resolve(ROOT, "MOBILE");
const SCAN_DIRS = existsSync(MOBILE_DIR) ? [MOBILE_DIR] : [ROOT];
const EXCLUDED = new Set([
  "node_modules",
  ".next",
  "build",
  "dist",
  "supabase/migrations",
  "checkPhase0Lockdown.mjs",
]);
const EXTENSIONS = new Set([".ts", ".tsx"]);

// Direct write bypass: fromSafe("table").insert( or .update( or .upsert(
const DIRECT_WRITE_REGEX = /fromSafe\s*\(\s*["'`][^"'`]+["'`]\s*\)\s*\.\s*(insert|update|upsert)\s*\(/;
// Supabase direct: supabase.from("table").insert(
const SUPABASE_WRITE_REGEX = /supabase\s*\.\s*from\s*\(\s*["'`][^"'`]+["'`]\s*\)\s*\.\s*(insert|update|upsert)\s*\(/;
// M2: no writes to legacy content tables (must use _v2 tables)
const LEGACY_TABLE_WRITE_REGEX = /safe(Insert|Update|Upsert)\s*\(\s*["'](journal_entries|check_ins|conversation_messages|user_reports)["']/;
// Body logging (single line): console.log/error with req.body, request.body, res.body, response.body only
const BODY_LOG_REGEX = /console\s*\.\s*(log|error|warn)\s*\([^)]*(req\s*\.\s*body|request\s*\.\s*body|res\s*\.\s*body|response\s*\.\s*body)/;
// Forbidden identifier logging: console.log/error/warn with reply/content/message/transcript/prompt/summary/note as identifier (first or later arg). Case-insensitive. Excludes test/ and logGuard.ts (see shouldCheckForbiddenLog).
const FORBIDDEN_LOG_REGEX = /console\s*\.\s*(log|error|warn)\s*\(\s*(reply|content|message|transcript|prompt|summary|note)\b|console\s*\.\s*(log|error|warn)\s*\([^)]*,\s*(reply|content|message|transcript|prompt|summary|note)\b/i;

async function walk(dir, results = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    if (EXCLUDED.has(name)) continue;
    const full = resolve(dir, name);
    const rel = relative(ROOT, full);
    if (entry.isDirectory()) {
      await walk(full, results);
    } else if (entry.isFile() && EXTENSIONS.has(rel.slice(-3))) {
      results.push(full);
    }
  }
  return results;
}

function shouldCheckForbiddenLog(filePath) {
  const rel = relative(ROOT, filePath).split(sep).join(sep);
  const inAppOrLib = rel.startsWith("app" + sep) || rel.startsWith("lib" + sep);
  const isLogGuard = filePath.endsWith("logGuard.ts");
  const isSafeTables = filePath.endsWith("safeTables.ts");
  return inAppOrLib && !isLogGuard && !isSafeTables;
}

async function scanFile(filePath) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const checkForbiddenLog = shouldCheckForbiddenLog(filePath);
  let lineNum = 0;
  for await (const line of rl) {
    lineNum += 1;
    if (DIRECT_WRITE_REGEX.test(line)) {
      console.error("[PHASE0-LOCKDOWN] Direct write bypass detected (use safeInsert/safeUpdate/safeUpsert)");
      console.error(`${relative(ROOT, filePath)}:${lineNum}: ${line.trim()}`);
      return true;
    }
    if (SUPABASE_WRITE_REGEX.test(line)) {
      console.error("[PHASE0-LOCKDOWN] Supabase direct write detected (use safeInsert/safeUpdate/safeUpsert)");
      console.error(`${relative(ROOT, filePath)}:${lineNum}: ${line.trim()}`);
      return true;
    }
    if (BODY_LOG_REGEX.test(line)) {
      console.error("[PHASE0-LOCKDOWN] Request/response body logging detected (do not log req.body or response)");
      console.error(`${relative(ROOT, filePath)}:${lineNum}: ${line.trim()}`);
      return true;
    }
    if (LEGACY_TABLE_WRITE_REGEX.test(line)) {
      console.error("[M2] Write to legacy content table detected (use _v2 tables: journal_entries_v2, check_ins_v2, conversation_metadata_v2, user_reports_v2)");
      console.error(`${relative(ROOT, filePath)}:${lineNum}: ${line.trim()}`);
      return true;
    }
    if (checkForbiddenLog && FORBIDDEN_LOG_REGEX.test(line)) {
      console.error("[PHASE0-LOCKDOWN] Forbidden identifier logging detected (do not log reply/content/message/transcript/prompt/summary/note in app or lib)");
      console.error(`${relative(ROOT, filePath)}:${lineNum}: ${line.trim()}`);
      return true;
    }
  }
  return false;
}

async function main() {
  const dirs = SCAN_DIRS.filter((d) => existsSync(d));
  for (const dir of dirs) {
    try {
      const files = await walk(dir);
      for (const file of files) {
        if (await scanFile(file)) {
          process.exit(1);
        }
      }
    } catch (e) {
      if (e.code === "ENOENT") continue;
      console.error("[PHASE0-LOCKDOWN] scan failed", e);
      process.exit(1);
    }
  }
  process.exit(0);
}

main();
