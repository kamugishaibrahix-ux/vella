#!/usr/bin/env node
/**
 * CI guard: fail if any migration contains destructive SQL.
 * Scans: supabase/migrations/ and MOBILE/supabase/migrations/ (all .sql files).
 *
 * Blocked (case-insensitive, after stripping comments):
 * - DROP TABLE
 * - DROP COLUMN
 * - TRUNCATE
 * - ALTER TABLE ... DROP
 * - DELETE FROM without WHERE (heuristic: statement has no WHERE)
 * - UPDATE without WHERE (heuristic: statement has no WHERE)
 *
 * Output: file path + offending line numbers and snippet. Exit 1 if any violation.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const MIGRATION_DIRS = [
  path.join(repoRoot, "supabase", "migrations"),
  path.join(repoRoot, "MOBILE", "supabase", "migrations"),
];

/**
 * Strip single-line comments (-- to EOL). Does not strip inside string literals.
 */
function stripLineComment(line) {
  return line.replace(/--.*$/, "").trim();
}

/**
 * Strip block comments (slash-star to star-slash) from string (non-greedy).
 */
function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * Get all .sql files under dir (recursive).
 */
function getSqlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...getSqlFiles(full));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".sql")) files.push(full);
  }
  return files.sort();
}

/**
 * Run line-based checks (DROP TABLE, DROP COLUMN, TRUNCATE, ALTER TABLE ... DROP).
 * Uses original lines; strips only -- for matching so line numbers match file.
 * Returns array of { lineNum, line, rule }.
 */
function checkLinePatterns(lines) {
  const violations = [];
  const dropTable = /^\s*drop\s+table\s+/i;
  const dropColumn = /^\s*drop\s+column\s+/i;
  const truncate = /^\s*truncate\s+/i;
  const alterTableDrop = /\balter\s+table\s+[\s\S]*\bdrop\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = stripLineComment(line);
    if (!stripped) continue;

    if (dropTable.test(stripped)) violations.push({ lineNum: i + 1, line: line.trim(), rule: "DROP TABLE" });
    if (dropColumn.test(stripped)) violations.push({ lineNum: i + 1, line: line.trim(), rule: "DROP COLUMN" });
    if (truncate.test(stripped)) violations.push({ lineNum: i + 1, line: line.trim(), rule: "TRUNCATE" });
    if (alterTableDrop.test(stripped)) violations.push({ lineNum: i + 1, line: line.trim(), rule: "ALTER TABLE ... DROP" });
  }
  return violations;
}

/**
 * Run statement-level checks: DELETE FROM without WHERE, UPDATE without WHERE.
 * content: full file content with block comments stripped, lines joined with \n.
 * lines: original line array (for line number mapping).
 */
function checkStatementPatterns(content, lines) {
  const violations = [];
  const strippedLines = lines.map((l) => stripLineComment(l));
  const joined = strippedLines.join("\n");
  const statements = joined.split(";").map((s) => s.trim()).filter(Boolean);

  let offset = 0;
  for (const st of statements) {
    const startIndex = joined.indexOf(st, offset);
    offset = startIndex + st.length;
    const lineNum = joined.slice(0, startIndex).split("\n").length;
    const normalized = st.replace(/\s+/g, " ").toLowerCase();

    const hasDeleteFrom = /delete\s+from\s+\S+/.test(normalized);
    const hasWhere = /\bwhere\b/.test(normalized);
    if (hasDeleteFrom && !hasWhere) {
      violations.push({
        lineNum,
        line: st.slice(0, 80) + (st.length > 80 ? "..." : ""),
        rule: "DELETE FROM without WHERE (heuristic)",
      });
    }

    const hasUpdateSet = /update\s+\S+\s+set\s+/.test(normalized);
    if (hasUpdateSet && !hasWhere) {
      violations.push({
        lineNum,
        line: st.slice(0, 80) + (st.length > 80 ? "..." : ""),
        rule: "UPDATE without WHERE (heuristic)",
      });
    }
  }
  return violations;
}

function checkFile(filePath) {
  const relPath = path.relative(repoRoot, filePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  const blockStripped = stripBlockComments(raw);
  const blockStrippedLines = blockStripped.split(/\r?\n/);

  const violations = [];

  // Line-based: use original lines so line numbers match file; strip only -- for matching
  const lineViolations = checkLinePatterns(lines);
  for (const v of lineViolations) {
    violations.push({ ...v, line: (lines[v.lineNum - 1] || v.line).trim() });
  }

  const stViolations = checkStatementPatterns(blockStrippedLines.join("\n"), blockStrippedLines);
  for (const v of stViolations) {
    violations.push(v);
  }

  return violations.map((v) => ({ file: relPath, ...v }));
}

function main() {
  const allViolations = [];
  for (const dir of MIGRATION_DIRS) {
    const files = getSqlFiles(dir);
    for (const f of files) {
      try {
        const violations = checkFile(f);
        allViolations.push(...violations);
      } catch (err) {
        console.error(`Error reading ${f}:`, err.message);
        process.exit(1);
      }
    }
  }

  if (allViolations.length === 0) {
    console.log("check-migrations-safe: no destructive statements found.");
    process.exit(0);
  }

  console.error("check-migrations-safe: DESTRUCTIVE MIGRATION STATEMENTS BLOCKED BY CI\n");
  const byFile = new Map();
  for (const v of allViolations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  for (const [file, list] of byFile) {
    console.error(`  ${file}`);
    for (const v of list) {
      console.error(`    Line ${v.lineNum}: [${v.rule}] ${v.line}`);
    }
    console.error("");
  }
  console.error("Destructive SQL belongs in runbook-sql/. Remove or move these statements.");
  console.error("See docs/ops/MIGRATION_POLICY.md (Runbook SQL).");
  process.exit(1);
}

main();
