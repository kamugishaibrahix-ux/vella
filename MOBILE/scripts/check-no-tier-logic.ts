/**
 * CI Guard: No Tier String Logic in Runtime
 *
 * Scans MOBILE/lib for forbidden tier-string comparison patterns.
 * MUST pass before build. Violations block CI.
 *
 * Allowed exceptions:
 * - types.ts (type definitions)
 * - uiTierModel.ts (UI display strings)
 * - test files
 * - *.test.ts / *.test.tsx
 * - defaultEntitlements.ts (tier validation functions)
 * - planUtils.ts (tier resolution with throw)
 */

import * as fs from "fs";
import * as path from "path";

const LIB_DIR = path.resolve(__dirname, "..", "lib");

const FORBIDDEN_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /tier\s*===/, label: 'tier ===' },
  { regex: /tier\s*!==/, label: 'tier !==' },
  { regex: /plan\s*===/, label: 'plan ===' },
  { regex: /plan\s*!==/, label: 'plan !==' },
  { regex: /planTier\s*===/, label: 'planTier ===' },
  { regex: /planTier\s*!==/, label: 'planTier !==' },
  { regex: /switch\s*\(\s*plan\s*\)/, label: 'switch(plan)' },
  { regex: /switch\s*\(\s*tier\s*\)/, label: 'switch(tier)' },
  { regex: /switch\s*\(\s*planTier\s*\)/, label: 'switch(planTier)' },
];

const IGNORED_FILES = new Set([
  "types.ts",
  "uiTierModel.ts",
  "defaultEntitlements.ts",
  "planUtils.ts",
  "tierCheck.ts",
  "stripeProducts.ts",
  "memoryTierConfig.ts",
  "pricingConfig.ts",
]);

function isIgnored(filePath: string): boolean {
  const basename = path.basename(filePath);
  if (IGNORED_FILES.has(basename)) return true;
  if (basename.endsWith(".test.ts") || basename.endsWith(".test.tsx")) return true;
  if (filePath.includes("node_modules")) return true;
  if (filePath.includes("__tests__")) return true;
  return false;
}

function scanDir(dir: string): string[] {
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
      results.push(...scanDir(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      results.push(fullPath);
    }
  }
  return results;
}

interface Violation {
  file: string;
  line: number;
  pattern: string;
  content: string;
}

function stripComments(source: string): string {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") result += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    result += source[i];
    i++;
  }
  return result;
}

function checkFile(filePath: string): Violation[] {
  if (isIgnored(filePath)) return [];

  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = stripComments(raw).split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const { regex, label } of FORBIDDEN_PATTERNS) {
      if (regex.test(line)) {
        violations.push({
          file: path.relative(process.cwd(), filePath),
          line: i + 1,
          pattern: label,
          content: trimmed.slice(0, 120),
        });
      }
    }
  }

  return violations;
}

// Main
const files = scanDir(LIB_DIR);
const allViolations: Violation[] = [];

for (const file of files) {
  allViolations.push(...checkFile(file));
}

if (allViolations.length > 0) {
  console.error("\n❌ TIER STRING LOGIC DETECTED IN RUNTIME CODE\n");
  console.error("The following files contain forbidden tier-string comparisons:");
  console.error("These must be replaced with entitlement-based checks.\n");

  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}  [${v.pattern}]`);
    console.error(`    ${v.content}\n`);
  }

  console.error(`\nTotal violations: ${allViolations.length}`);
  console.error("See lib/plans/NO_TIER_STRINGS_RULE.md for migration guide.\n");
  process.exit(1);
}

console.log("✅ No tier string logic found in MOBILE/lib/. CI check passed.");
process.exit(0);
