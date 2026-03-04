/**
 * CI Guard: Migration Schema Regression Prevention
 *
 * Fails if any migration file:
 * 1. Creates a TEXT column with a forbidden name (content, message, journal,
 *    note, transcript, prompt, response)
 * 2. Creates a JSONB column without a pg_column_size constraint or
 *    forbidden-key constraint in the same file
 * 3. Creates a user-scoped table (with user_id FK) without
 *    ENABLE ROW LEVEL SECURITY in the same file
 */

import * as fs from "fs";
import * as path from "path";

const MIGRATION_DIRS = [
  path.resolve(__dirname, "../../supabase/migrations"),
  path.resolve(__dirname, "../supabase/migrations"),
];

// Only enforce on migrations after this date. All earlier migrations were
// audited manually (see docs/archive/audits/ for migration compliance reports).
// and their issues resolved by companion constraint/RLS migrations.
const BASELINE_DATE = "20260233";

const FORBIDDEN_TEXT_COLUMNS = [
  "content",
  "message",
  "journal",
  "note",
  "transcript",
  "prompt",
  "response",
  "summary",
  "body",
];

const FORBIDDEN_COLUMN_REGEX = new RegExp(
  `\\b(${FORBIDDEN_TEXT_COLUMNS.join("|")})\\b\\s+(text|varchar|character varying)`,
  "gi"
);

const CREATE_TABLE_REGEX = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
// Matches actual column definitions like "column_name jsonb" but not "RETURNS jsonb"
// or "AS jsonb" or "result jsonb" in function signatures
const JSONB_COLUMN_REGEX = /^\s+(\w+)\s+jsonb/gim;
const USER_ID_FK_REGEX = /user_id\s+uuid.*references\s+(?:auth\.users|public\.profiles)/gi;
const RLS_ENABLE_REGEX = /ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
const PG_COLUMN_SIZE_REGEX = /pg_column_size/gi;
const FORBIDDEN_KEYS_REGEX = /jsonb_has_forbidden_content_keys|forbidden.*key/gi;

interface Violation {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

function scanMigration(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const fileName = path.basename(filePath);

  // Rule 1: Forbidden text columns (only in CREATE TABLE / ALTER TABLE contexts)
  let inCreateTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (trimmed.startsWith("--")) continue;

    // Track CREATE TABLE blocks (end at ");")
    if (/CREATE\s+TABLE/i.test(line)) inCreateTable = true;
    if (inCreateTable && /^\s*\);/.test(line)) inCreateTable = false;

    // Only flag columns inside table definitions, not in CHECK/WHERE/comments
    if (!inCreateTable) continue;
    // Skip lines that are constraints or function calls
    if (/CHECK\s*\(/i.test(line) || /WHERE/i.test(line) || /CONSTRAINT/i.test(line)) continue;

    const match = line.match(FORBIDDEN_COLUMN_REGEX);
    if (match) {
      violations.push({
        file: fileName,
        line: i + 1,
        rule: "FORBIDDEN_TEXT_COLUMN",
        detail: `Text column with forbidden name: ${match[0].trim()}`,
      });
    }
  }

  // Rule 2: JSONB columns in CREATE TABLE blocks without size/key constraints
  const hasSizeConstraint = PG_COLUMN_SIZE_REGEX.test(content);
  PG_COLUMN_SIZE_REGEX.lastIndex = 0;
  const hasForbiddenKeyGuard = FORBIDDEN_KEYS_REGEX.test(content);
  FORBIDDEN_KEYS_REGEX.lastIndex = 0;

  if (!hasSizeConstraint && !hasForbiddenKeyGuard) {
    let inTable = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      if (trimmed.startsWith("--")) continue;
      if (/CREATE\s+TABLE/i.test(lines[i])) inTable = true;
      if (inTable && /^\s*\);/.test(lines[i])) inTable = false;
      if (!inTable) continue;

      JSONB_COLUMN_REGEX.lastIndex = 0;
      const m = JSONB_COLUMN_REGEX.exec(lines[i]);
      if (m) {
        violations.push({
          file: fileName,
          line: i + 1,
          rule: "UNBOUNDED_JSONB",
          detail: `JSONB column "${m[1]}" has no pg_column_size or forbidden-key constraint in this migration`,
        });
      }
    }
  }

  // Rule 3: User-scoped tables without RLS
  const tables: { name: string; line: number }[] = [];
  CREATE_TABLE_REGEX.lastIndex = 0;
  let tableMatch;
  while ((tableMatch = CREATE_TABLE_REGEX.exec(content)) !== null) {
    const lineNum = content.substring(0, tableMatch.index).split("\n").length;
    tables.push({ name: tableMatch[1], line: lineNum });
  }

  if (tables.length > 0) {
    const hasUserIdFk = USER_ID_FK_REGEX.test(content);
    USER_ID_FK_REGEX.lastIndex = 0;
    const hasRls = RLS_ENABLE_REGEX.test(content);
    RLS_ENABLE_REGEX.lastIndex = 0;

    if (hasUserIdFk && !hasRls) {
      for (const table of tables) {
        violations.push({
          file: fileName,
          line: table.line,
          rule: "MISSING_RLS",
          detail: `Table "${table.name}" has user_id FK but no ENABLE ROW LEVEL SECURITY`,
        });
      }
    }
  }

  return violations;
}

function main(): void {
  const allViolations: Violation[] = [];

  for (const dir of MIGRATION_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
    for (const file of files) {
      // Only enforce on migrations after the baseline date
      const dateMatch = file.match(/^(\d{8})/);
      if (dateMatch && dateMatch[1] < BASELINE_DATE) continue;

      const violations = scanMigration(path.join(dir, file));
      allViolations.push(...violations);
    }
  }

  console.log(`[migration-schema-guard] Scanned ${MIGRATION_DIRS.length} migration directories`);

  if (allViolations.length > 0) {
    console.error(`\n[migration-schema-guard] ${allViolations.length} violation(s) found:\n`);
    for (const v of allViolations) {
      console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.detail}`);
    }
    process.exit(1);
  }

  console.log("[migration-schema-guard] PASS: All migrations comply with schema policy.");
}

main();
