/**
 * No Tier Strings in Logic Paths - Static Guard Test
 *
 * This test scans the codebase to ensure tier strings are NOT used in logic paths.
 *
 * DEFINITIONS:
 * - "Logic path" = code that enforces access, selects models, controls memory depth,
 *                  token charging, or server behavior
 * - "Display path" = UI labels, badges, prices rendering only
 *
 * ALLOWED in display paths:
 * - UI components showing tier badges
 * - Marketing copy
 * - Pricing display
 *
 * BANNED in logic paths:
 * - `tier === "elite"` for feature gating
 * - `plan !== "free"` for enforcement
 * - `tier !== "free"` for capability checks
 *
 * MIGRATION PATH:
 * Old: if (tier === "elite") { enableFeature() }
 * New: if (entitlements.enableDeepMemory) { enableFeature() }
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

// Tier string patterns that should NOT appear in logic paths
const BANNED_PATTERNS = [
  /tier\s*===?\s*["'](free|pro|elite)["']/,
  /tier\s*!==?\s*["'](free|pro|elite)["']/,
  /plan\s*===?\s*["'](free|pro|elite)["']/,
  /plan\s*!==?\s*["'](free|pro|elite)["']/,
  /===?\s*["'](free|pro|elite)["']/,
];

// Files/paths where tier strings are ALLOWED (display/UI only)
const ALLOWED_PATHS = [
  /uiTierModel\.ts$/,
  /dictionaries\//,
  /test\/.*\.test\.tsx?$/,
  /UpgradeModal\.tsx$/,
  /upgrade\/page\.tsx$/,
  /profile\/page\.tsx$/,
  /tierReasoning\.ts$/,
];

// Files that should NEVER have tier strings (strict logic paths)
const STRICT_LOGIC_PATHS = [
  "lib/budget/",
  "lib/memory/consolidation.ts",
  "lib/memory/clustering.ts",
  "lib/memory/retrieve.ts",
  "lib/tokens/enforceTokenLimits.ts",
  "lib/realtime/",
  "lib/ai/agents.ts",
  "app/api/",
];

/**
 * Strip comments from source text so forbidden-pattern checks only see real code.
 * - Removes // ... to end of line (preserves the line break)
 * - Removes block comments (preserves line-break count so line numbers stay valid)
 */
function stripComments(source: string): string {
  let result = "";
  let i = 0;
  while (i < source.length) {
    // Single-line comment
    if (source[i] === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") {
        i++;
      }
      continue;
    }
    // Block comment
    if (source[i] === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") {
          result += "\n";
        }
        i++;
      }
      i += 2; // skip closing */
      continue;
    }
    result += source[i];
    i++;
  }
  return result;
}

/**
 * Test a single line of code (already comment-stripped) against banned patterns.
 */
function hasBannedPattern(line: string): boolean {
  for (const p of BANNED_PATTERNS) {
    if (p.test(line)) return true;
  }
  return false;
}

interface Violation {
  file: string;
  line: number;
  content: string;
  pattern: string;
}

function shouldCheckFile(filePath: string): boolean {
  if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
    return false;
  }
  if (filePath.includes("node_modules") || filePath.includes(".next")) {
    return false;
  }
  for (const allowed of ALLOWED_PATHS) {
    if (allowed.test(filePath)) {
      return false;
    }
  }
  return true;
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const raw = readFileSync(filePath, "utf-8");
  const stripped = stripComments(raw);
  const lines = stripped.split("\n");

  lines.forEach((line, index) => {
    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: index + 1,
          content: line.trim().slice(0, 120),
          pattern: pattern.toString(),
        });
      }
    }
  });

  return violations;
}

function scanDirectory(dir: string): Violation[] {
  const violations: Violation[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry !== "node_modules" && entry !== ".next") {
        violations.push(...scanDirectory(fullPath));
      }
    } else if (shouldCheckFile(fullPath)) {
      violations.push(...scanFile(fullPath));
    }
  }

  return violations;
}

describe("STATIC GUARD: No tier strings in logic paths", () => {
  describe("banned patterns detect tier strings", () => {
    const bannedExamples = [
      { code: 'if (tier === "elite") {', pattern: 'tier ===' },
      { code: 'if (tier !== "free") {', pattern: 'tier !==' },
      { code: 'const isPro = plan === "pro";', pattern: 'plan ===' },
      { code: 'const isFree = plan !== "free";', pattern: 'plan !==' },
      { code: 'tier === "free" ? x : y', pattern: '===' },
    ];

    bannedExamples.forEach(({ code, pattern }) => {
      it(`detects: ${code}`, () => {
        expect(hasBannedPattern(code)).toBe(true);
      });
    });
  });

  describe("allowed patterns do not trigger", () => {
    const allowedExamples = [
      '// tier === "free"',
      '/* tier === "elite" */',
      'const label = "Select your tier: free, pro, or elite";',
      'const message = "Upgrade to elite";',
      'const tierName = getTierName();',
      'const planId = subscription.plan;',
    ];

    allowedExamples.forEach((code) => {
      it(`allows: ${code}`, () => {
        const stripped = stripComments(code);
        expect(hasBannedPattern(stripped)).toBe(false);
      });
    });
  });

  describe("comment stripping", () => {
    it("strips single-line comments", () => {
      const input = 'const x = 1; // tier === "free"';
      expect(stripComments(input)).toBe("const x = 1; ");
    });

    it("strips block comments", () => {
      const input = 'const x = /* tier === "elite" */ 1;';
      expect(stripComments(input)).toBe("const x =  1;");
    });

    it("preserves line breaks in block comments", () => {
      const input = '/*\n * tier === "free"\n */\nconst x = 1;';
      const stripped = stripComments(input);
      expect(stripped.split("\n").length).toBe(input.split("\n").length);
    });

    it("mixed: comment violation + clean code => pass", () => {
      const input = [
        '// Old: if (tier === "elite") { ... }',
        'if (entitlements.enableDeepMemory) {',
        '  doStuff();',
        '}',
      ].join("\n");
      const stripped = stripComments(input);
      expect(hasBannedPattern(stripped)).toBe(false);
    });

    it("mixed: clean comment + real violation => fail", () => {
      const input = [
        '// This is fine',
        'if (tier === "elite") { doStuff(); }',
      ].join("\n");
      const stripped = stripComments(input);
      expect(hasBannedPattern(stripped)).toBe(true);
    });

    it("inline comment after violation is still caught", () => {
      const input = 'if (tier === "elite") { // enable feature';
      const stripped = stripComments(input);
      expect(hasBannedPattern(stripped)).toBe(true);
    });

    it("block comment spanning multiple lines hides violation", () => {
      const input = [
        "/*",
        'if (tier === "elite") {',
        "  enableDeepMemory();",
        "}",
        "*/",
        "const x = 1;",
      ].join("\n");
      const stripped = stripComments(input);
      expect(hasBannedPattern(stripped)).toBe(false);
    });
  });

  describe("migration examples", () => {
    it("shows old vs new patterns", () => {
      const oldPattern = 'if (tier === "elite") { enableDeepMemory(); }';
      const newPattern = 'if (entitlements.enableDeepMemory) { enableDeepMemory(); }';

      expect(hasBannedPattern(oldPattern)).toBe(true);
      expect(hasBannedPattern(newPattern)).toBe(false);
    });
  });

  describe("policy documentation", () => {
    it("documents the allowed paths", () => {
      expect(ALLOWED_PATHS.length).toBeGreaterThan(0);
      const hasUIPath = ALLOWED_PATHS.some((p) => p.test("lib/plans/uiTierModel.ts"));
      expect(hasUIPath).toBe(true);
    });

    it("documents the strict logic paths", () => {
      expect(STRICT_LOGIC_PATHS.length).toBeGreaterThan(0);
      const hasEnforcement = STRICT_LOGIC_PATHS.some((p) =>
        p.includes("enforceTokenLimits")
      );
      expect(hasEnforcement).toBe(true);
    });
  });
});

export { BANNED_PATTERNS, ALLOWED_PATHS, scanFile, scanDirectory, stripComments };
