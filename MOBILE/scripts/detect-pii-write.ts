#!/usr/bin/env ts-node
/**
 * BUILD-TIME PII VIOLATION DETECTOR
 * ==================================
 * CI/CD script that scans the codebase for forbidden PII write patterns.
 * Fails the build if any violations are found.
 *
 * Compliance: DATA_DESIGN.md Local-First Contract
 * Principle: Personal text must be structurally impossible to store in Supabase.
 *
 * Exit codes:
 * - 0: No violations found
 * - 1: Violations found (build fails)
 *
 * Usage:
 *   npm run check:pii
 *   npx ts-node scripts/detect-pii-write.ts
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const LIB_DIR = path.resolve(__dirname, "..", "lib");
const APP_DIR = path.resolve(__dirname, "..", "app");
const TESTS_DIR = path.resolve(__dirname, "..", "tests");
const SCRIPTS_DIR = path.resolve(__dirname, "..", "scripts");

/**
 * Forbidden patterns that indicate PII being written to Supabase.
 * These are patterns that would allow personal text to reach the database.
 */
const FORBIDDEN_PATTERNS: { regex: RegExp; label: string; severity: "error" | "warning" }[] = [
  // Direct Supabase insert patterns with forbidden fields
  { regex: /\.from\(["']journal_entries["']\).*\.insert\s*\(/, label: "Direct insert to journal_entries", severity: "error" },
  { regex: /\.from\(["']conversation_messages["']\).*\.insert\s*\(/, label: "Direct insert to conversation_messages", severity: "error" },
  { regex: /\.from\(["']check_ins["']\).*\.insert\s*\(/, label: "Direct insert to check_ins", severity: "error" },
  { regex: /\.from\(["']user_reports["']\).*\.insert\s*\(/, label: "Direct insert to user_reports", severity: "error" },
  { regex: /\.from\(["']user_nudges["']\).*\.insert\s*\(/, label: "Direct insert to user_nudges", severity: "error" },

  // Forbidden field patterns in Supabase operations
  { regex: /insert\s*:\s*\{\s*content\s*:/, label: "Insert with content field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*text\s*:/, label: "Insert with text field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*message\s*:/, label: "Insert with message field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*note\s*:/, label: "Insert with note field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*body\s*:/, label: "Insert with body field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*journal\s*:/, label: "Insert with journal field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*reflection\s*:/, label: "Insert with reflection field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*summary\s*:/, label: "Insert with summary field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*transcript\s*:/, label: "Insert with transcript field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*prompt\s*:/, label: "Insert with prompt field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*response\s*:/, label: "Insert with response field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*narrative\s*:/, label: "Insert with narrative field", severity: "error" },
  { regex: /insert\s*:\s*\{\s*description\s*:/, label: "Insert with description field", severity: "error" },

  // Update patterns with forbidden fields
  { regex: /update\s*:\s*\{\s*content\s*:/, label: "Update with content field", severity: "error" },
  { regex: /update\s*:\s*\{\s*text\s*:/, label: "Update with text field", severity: "error" },
  { regex: /update\s*:\s*\{\s*message\s*:/, label: "Update with message field", severity: "error" },
  { regex: /update\s*:\s*\{\s*note\s*:/, label: "Update with note field", severity: "error" },

  // Raw Supabase client bypassing safeSupabaseWrite
  { regex: /supabase\.from\([^)]+\)\.insert\s*\(/, label: "Raw Supabase insert (bypasses safeSupabaseWrite)", severity: "error" },
  { regex: /supabase\.from\([^)]+\)\.update\s*\(/, label: "Raw Supabase update (bypasses safeSupabaseWrite)", severity: "error" },
  { regex: /supabase\.from\([^)]+\)\.upsert\s*\(/, label: "Raw Supabase upsert (bypasses safeSupabaseWrite)", severity: "error" },

  // Semantic smuggling vectors
  { regex: /insert\s*:\s*\{\s*detail\s*:/, label: "Insert with detail field (semantic vector)", severity: "warning" },
  { regex: /insert\s*:\s*\{\s*details\s*:/, label: "Insert with details field (semantic vector)", severity: "warning" },
  { regex: /insert\s*:\s*\{\s*context\s*:/, label: "Insert with context field (semantic vector)", severity: "warning" },
  { regex: /insert\s*:\s*\{\s*notes\s*:/, label: "Insert with notes field (semantic vector)", severity: "warning" },
  { regex: /insert\s*:\s*\{\s*raw\s*:/, label: "Insert with raw field (semantic vector)", severity: "warning" },
  { regex: /insert\s*:\s*\{\s*payload\s*:/, label: "Insert with payload field (semantic vector)", severity: "warning" },
];

// ============================================================================
// IGNORED FILES/DIRECTORIES
// ============================================================================

const IGNORED_PATHS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "__tests__",
  "*.test.ts",
  "*.test.tsx",
  "*.spec.ts",
  "*.spec.tsx",
]);

const ALLOWED_FILES = new Set([
  // Files that are allowed to have Supabase patterns (they're part of the safety layer)
  "safeSupabaseWrite.ts",
  "piiFirewall.ts",
  "types_strict.ts",
  "admin.ts",
  "client.ts",
  "safeTables.ts",
]);

// ============================================================================
// TYPES
// ============================================================================

interface Violation {
  file: string;
  line: number;
  column: number;
  pattern: string;
  severity: "error" | "warning";
  code: string;
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function shouldIgnoreFile(filePath: string): boolean {
  const basename = path.basename(filePath);

  // Ignore test files
  if (basename.endsWith(".test.ts") || basename.endsWith(".test.tsx")) {
    return true;
  }
  if (basename.endsWith(".spec.ts") || basename.endsWith(".spec.tsx")) {
    return true;
  }

  // Ignore allowed safety layer files
  if (ALLOWED_FILES.has(basename)) {
    return true;
  }

  // Ignore node_modules and other ignored paths
  for (const ignored of IGNORED_PATHS) {
    if (filePath.includes(ignored)) {
      return true;
    }
  }

  return false;
}

function scanDirectory(dir: string): string[] {
  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_PATHS.has(entry.name)) {
        results.push(...scanDirectory(fullPath));
      }
    } else if (entry.isFile()) {
      if (
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !shouldIgnoreFile(fullPath)
      ) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function stripComments(source: string): string {
  // Remove single-line comments
  let result = source.replace(/\/\/.*$/gm, "");
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  return result;
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Strip comments for analysis
    const strippedContent = stripComments(content);
    const strippedLines = strippedContent.split("\n");

    for (let i = 0; i < strippedLines.length; i++) {
      const line = strippedLines[i];
      const originalLine = lines[i];

      for (const { regex, label, severity } of FORBIDDEN_PATTERNS) {
        regex.lastIndex = 0;
        const match = regex.exec(line);

        if (match) {
          // Find the column in the original line
          const column = originalLine.indexOf(match[0]) + 1;

          violations.push({
            file: path.relative(process.cwd(), filePath),
            line: i + 1,
            column,
            pattern: label,
            severity,
            code: match[0].slice(0, 50),
          });
        }
      }
    }
  } catch (error) {
    console.error(`[detect-pii-write] Error scanning ${filePath}:`, error);
  }

  return violations;
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log("[detect-pii-write] Scanning for PII write violations...\n");

  const allViolations: Violation[] = [];

  // Scan lib directory
  if (fs.existsSync(LIB_DIR)) {
    const libFiles = scanDirectory(LIB_DIR);
    for (const file of libFiles) {
      const violations = scanFile(file);
      allViolations.push(...violations);
    }
  }

  // Scan app directory
  if (fs.existsSync(APP_DIR)) {
    const appFiles = scanDirectory(APP_DIR);
    for (const file of appFiles) {
      const violations = scanFile(file);
      allViolations.push(...violations);
    }
  }

  // Scan tests directory
  if (fs.existsSync(TESTS_DIR)) {
    const testFiles = scanDirectory(TESTS_DIR);
    for (const file of testFiles) {
      const violations = scanFile(file);
      allViolations.push(...violations);
    }
  }

  // Scan scripts directory
  if (fs.existsSync(SCRIPTS_DIR)) {
    const scriptFiles = scanDirectory(SCRIPTS_DIR);
    for (const file of scriptFiles) {
      const violations = scanFile(file);
      allViolations.push(...violations);
    }
  }

  // Separate errors and warnings
  const errors = allViolations.filter((v) => v.severity === "error");
  const warnings = allViolations.filter((v) => v.severity === "warning");

  // Report results
  if (errors.length > 0) {
    console.error(`❌ PII WRITE VIOLATIONS DETECTED: ${errors.length} error(s)\n`);
    console.error("The following patterns indicate personal text could reach Supabase:\n");

    for (const v of errors) {
      console.error(`  ${v.file}:${v.line}:${v.column}`);
      console.error(`    [ERROR] ${v.pattern}`);
      console.error(`    Code: ${v.code}\n`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`⚠️  PII WRITE WARNINGS: ${warnings.length} warning(s)\n`);
    console.warn("The following patterns may indicate semantic smuggling vectors:\n");

    for (const v of warnings) {
      console.warn(`  ${v.file}:${v.line}:${v.column}`);
      console.warn(`    [WARNING] ${v.pattern}`);
      console.warn(`    Code: ${v.code}\n`);
    }
  }

  // Summary
  const totalFiles = (
    (fs.existsSync(LIB_DIR) ? scanDirectory(LIB_DIR).length : 0) +
    (fs.existsSync(APP_DIR) ? scanDirectory(APP_DIR).length : 0) +
    (fs.existsSync(TESTS_DIR) ? scanDirectory(TESTS_DIR).length : 0) +
    (fs.existsSync(SCRIPTS_DIR) ? scanDirectory(SCRIPTS_DIR).length : 0)
  );

  console.log(`\n[detect-pii-write] Scanned ${totalFiles} files`);
  console.log(`[detect-pii-write] Found ${errors.length} error(s), ${warnings.length} warning(s)`);

  // Exit with error code if violations found
  if (errors.length > 0) {
    console.error("\n❌ BUILD FAILED: PII write violations detected.");
    console.error("Personal text cannot be stored in Supabase per DATA_DESIGN.md.");
    console.error("Use safeInsert/safeUpdate from @/lib/safe/safeSupabaseWrite");
    console.error("and ensure no forbidden fields are included in payloads.\n");
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn("\n⚠️  Build passed with warnings. Review semantic smuggling vectors.");
  }

  console.log("\n✅ PASS: No PII write violations detected.");
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main, scanFile, scanDirectory };
