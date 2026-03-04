#!/usr/bin/env node
/**
 * verify-tables-in-migrations.mjs
 *
 * Scans application code for supabase.from("<table>") and verifies every
 * referenced table exists in supabase/migrations (root stream).
 * Exit 0 on PASS, 1 on FAIL.
 *
 * Scopes: MOBILE/app, MOBILE/lib, apps/vella-control/app (excludes tests, scripts, docs).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const SCAN_DIRS = [
  path.join(repoRoot, "MOBILE", "app"),
  path.join(repoRoot, "MOBILE", "lib"),
  path.join(repoRoot, "apps", "vella-control", "app"),
];

function getTablesFromMigrations() {
  const tables = new Set();
  if (!fs.existsSync(migrationsDir)) return tables;
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    // CREATE TABLE [IF NOT EXISTS] [public.]tablename
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi;
    let m;
    while ((m = re.exec(content)) !== null) tables.add(m[1].toLowerCase());
  }
  return tables;
}

function walkDir(dir, exts, out) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") walkDir(full, exts, out);
    } else if (exts.some((ext) => e.name.endsWith(ext))) {
      out.push(full);
    }
  }
}

function extractTableRefs(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  // Strip single-line comments so commented-out .from("table") are ignored
  content = content.replace(/\/\/[^\n]*/g, "");
  const tables = new Set();
  // .from("x") .from('x') .from(`x`)
  const re = /\.from\s*\(\s*["'`](\w+)["'`]\s*\)/g;
  let m;
  while ((m = re.exec(content)) !== null) tables.add(m[1]);
  return tables;
}

function main() {
  const migrationTables = getTablesFromMigrations();
  const refsByTable = new Map(); // table -> [ file paths ]

  const exts = [".ts", ".tsx", ".js", ".jsx"];
  for (const dir of SCAN_DIRS) {
    const files = [];
    walkDir(dir, exts, files);
    for (const f of files) {
      for (const table of extractTableRefs(f)) {
        if (!refsByTable.has(table)) refsByTable.set(table, []);
        refsByTable.get(table).push(path.relative(repoRoot, f));
      }
    }
  }

  const missing = [];
  for (const [table, files] of refsByTable) {
    if (!migrationTables.has(table.toLowerCase())) {
      missing.push({ table, files });
    }
  }

  if (missing.length > 0) {
    console.error("[verify-tables-in-migrations] FAIL: Tables referenced in code but not in supabase/migrations:");
    for (const { table, files } of missing) {
      console.error(`  - ${table}`);
      files.slice(0, 5).forEach((f) => console.error(`      ${f}`));
      if (files.length > 5) console.error(`      ... and ${files.length - 5} more`);
    }
    process.exit(1);
  }

  console.log("[verify-tables-in-migrations] PASS: All referenced tables exist in supabase/migrations.");
  process.exit(0);
}

main();
