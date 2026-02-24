#!/usr/bin/env node

/**
 * Enforces the Path B rule: Supabase may only touch metadata tables.
 * Scans source files for `.from("table")` plus safeInsert/update/upsert calls.
 * If any forbidden personal-data tables appear, the script fails the build.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mobileRoot = path.join(repoRoot, "MOBILE");

// Tables that must not be written to (Phase 0: write-blocked in safeSupabaseWrite; reads allowed for migration).
// journal_entries, conversation_messages, check_ins, memory_chunks are WRITE_BLOCKED_TABLES — do not list here so reads can stay.
const PERSONAL_TABLES = [
  "checkins",
  "user_traits",
  "user_traits_history",
  "user_nudges",
  "conversation_transcripts",
  "memory_snapshots",
  "short_term_memory",
  "deep_insights",
  "sleep_energy_models",
  "behaviour_maps",
  "vella_world_state",
];

const SCAN_TARGETS = ["app", "components", "lib", "middleware.ts", "scripts"]
  .map((entry) => path.join(mobileRoot, entry));

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const IGNORED_DIRNAMES = new Set(["node_modules", ".next", ".turbo", ".git"]);

/**
 * Escapes RegExp special characters.
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPatterns(table) {
  const escaped = escapeRegex(table);
  return [
    { label: ".from", regex: new RegExp(`\\.from\\(\\s*['"\`]${escaped}['"\`]`, "g") },
    { label: "fromSafe", regex: new RegExp(`fromSafe\\(\\s*['"\`]${escaped}['"\`]`, "g") },
    { label: "safeInsert", regex: new RegExp(`safeInsert(?:<[^>]+>)?\\(\\s*['"\`]${escaped}['"\`]`, "g") },
    { label: "safeUpdate", regex: new RegExp(`safeUpdate(?:<[^>]+>)?\\(\\s*['"\`]${escaped}['"\`]`, "g") },
    { label: "safeUpsert", regex: new RegExp(`safeUpsert(?:<[^>]+>)?\\(\\s*['"\`]${escaped}['"\`]`, "g") },
  ];
}

async function walk(targetPath, results) {
  let stats;
  try {
    stats = await stat(targetPath);
  } catch {
    return;
  }

  if (stats.isDirectory()) {
    if (IGNORED_DIRNAMES.has(path.basename(targetPath))) {
      return;
    }
    const entries = await readdir(targetPath);
    await Promise.all(entries.map((entry) => walk(path.join(targetPath, entry), results)));
    return;
  }

  if (!SCAN_EXTENSIONS.has(path.extname(targetPath))) {
    return;
  }

  const content = await readFile(targetPath, "utf8");
  for (const table of PERSONAL_TABLES) {
    for (const { label, regex } of buildPatterns(table)) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const preceding = content.slice(0, match.index);
        const line = preceding.split(/\r?\n/).length;
        results.push({
          file: path.relative(repoRoot, targetPath),
          table,
          line,
          pattern: label,
        });
      }
    }
  }
}

async function main() {
  const findings = [];
  await Promise.all(SCAN_TARGETS.map((target) => walk(target, findings)));

  if (findings.length === 0) {
    console.log("[supabase-scan] No personal-data tables referenced.");
    return;
  }

  console.error("[supabase-scan] Forbidden Supabase tables detected:");
  for (const finding of findings) {
    console.error(`  - ${finding.table} @ ${finding.file}:${finding.line} via ${finding.pattern}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("[supabase-scan] Failed to complete scan", error);
  process.exitCode = 1;
});


