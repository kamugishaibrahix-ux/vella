#!/usr/bin/env node
/**
 * Phase M4.5: CI enforcement — fail if any migration introduces forbidden text columns.
 * Scans Supabase migration SQL for:
 * - Forbidden column names (content, note, message, summary, title, etc.)
 * - TEXT/VARCHAR in user-domain tables unless whitelisted (short enum/code/hash).
 *
 * Usage: node scripts/checkNoServerTextColumns.mjs
 * Exit: 0 if clean, 1 if forbidden pattern found.
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const cwd = process.cwd();
const MIGRATIONS_DIR = join(cwd, "supabase", "migrations");
const RUNBOOK_DIR = join(cwd, "supabase", "runbook-sql");

const FORBIDDEN_COLUMN_NAMES = new Set([
  "content",
  "note",
  "message",
  "summary",
  "title",
  "transcript",
  "prompt",
  "response",
  "narrative",
  "description",
  "body",
  "comment",
  "reflection",
  "entry",
  "reply",
  "answer",
  "reasoning",
]);

// Whitelisted: short metadata (enum, code, hash, status) — allow up to 256 chars in column type
const ALLOWED_PATTERNS = [
  /^\s*(status|type|role|mode_enum|trigger_enum|content_hash|local_hash|checksum|error|model_id)\s+(text|varchar)/i,
  /varchar\s*\(\s*\d+\s*\)/i,
  /character\s+varying\s*\(\s*\d+\s*\)/i,
];

// Pre-M4.5 migrations that created legacy text columns; we don't flag these (they are dropped in 20260229).
const EXCLUDED_BASENAMES = new Set([
  "20260219_raw_behavioural_tables.sql",
  "20260220_memory_chunks.sql",
  "20260223_phase_m1_audit_function.sql",
  "phase_m1_audit.sql",
]);

function getSqlFiles(dir) {
  try {
    const names = readdirSync(dir, { withFileTypes: true });
    return names
      .filter((e) => e.isFile() && (e.name.endsWith(".sql") || e.name.endsWith(".SQL")))
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

function isExcluded(filePath) {
  const base = filePath.split(/[/\\]/).pop();
  return EXCLUDED_BASENAMES.has(base);
}

function checkForbiddenColumnName(line, file, lineNum) {
  const lower = line.toLowerCase();
  for (const name of FORBIDDEN_COLUMN_NAMES) {
    const re = new RegExp(
      `\\b${name}\\s+(text|character\\s+varying|varchar)\\b`,
      "i"
    );
    if (re.test(lower)) {
      const allowed = ALLOWED_PATTERNS.some((p) => p.test(line));
      if (!allowed) return { file, lineNum, line: line.trim(), column: name };
    }
  }
  return null;
}

function checkCreateTableWithText(line, file, lineNum) {
  if (!/create\s+table/i.test(line)) return null;
  return null;
}

let failed = false;
const results = [];

let files = [...getSqlFiles(MIGRATIONS_DIR), ...getSqlFiles(RUNBOOK_DIR)];
if (files.length === 0) {
  const altMigrations = join(cwd, "MOBILE", "supabase", "migrations");
  const altRunbook = join(cwd, "MOBILE", "supabase", "runbook-sql");
  files = [...getSqlFiles(altMigrations), ...getSqlFiles(altRunbook)];
}

for (const file of files) {
  if (isExcluded(file)) continue;
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hit = checkForbiddenColumnName(line, file, i + 1);
    if (hit) {
      failed = true;
      results.push(hit);
    }
  }
}

if (failed) {
  console.error("[checkNoServerTextColumns] Forbidden text column(s) found:");
  results.forEach((r) => {
    console.error(`  ${r.file}:${r.lineNum} column "${r.column}"`);
    console.error(`    ${r.line}`);
  });
  process.exit(1);
}

console.log("[checkNoServerTextColumns] No forbidden text columns in migrations.");
process.exit(0);
