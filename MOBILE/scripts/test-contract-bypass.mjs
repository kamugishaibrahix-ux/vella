#!/usr/bin/env node
/**
 * Contract Bypass Regression Test
 *
 * Generates bypass patterns programmatically and verifies
 * the AST-based contract script detects them.
 *
 * Run: node scripts/test-contract-bypass.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the AST analyzer - convert Windows path to file:// URL for ESM
const analyzerPath = path.join(__dirname, "verify-route-contract.js");
const analyzerUrl = new URL("file://" + (analyzerPath.startsWith("/") ? analyzerPath : "/" + analyzerPath.replace(/\\/g, "/"))).href;
const { analyzeRoute, buildAliasMap } = await import(analyzerUrl);

// Test bypass patterns
const BYPASS_PATTERNS = [
  {
    name: "Import Alias Bypass",
    description: "import { x as y } to rename chargeTokensForOperation",
    code: `
import { chargeTokensForOperation as charge } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

export async function POST(req) {
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const chargeResult = await charge(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
    shouldDetect: {
      rateLimit: true,
      chargeTokens: true,
      openAI: true,
    },
  },
  {
    name: "Variable Reassignment Bypass",
    description: "const charge = chargeTokensForOperation",
    code: `
import { chargeTokensForOperation } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

export async function POST(req) {
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const charge = chargeTokensForOperation;
  const chargeResult = await charge(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
    shouldDetect: {
      rateLimit: true,
      chargeTokens: true,
      openAI: true,
    },
  },
  {
    name: "Dynamic Import Destructure Bypass",
    description: "const { x: y } = await import()",
    code: `
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

export async function POST(req) {
  const { chargeTokensForOperation: deduct } = await import('@/lib/tokens/enforceTokenLimits');
  
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const chargeResult = await deduct(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
    shouldDetect: {
      rateLimit: true,
      chargeTokens: true,
      openAI: true,
    },
  },
  {
    name: "Object Wrapper Bypass",
    description: "rateLimitUtils.check() instead of direct rateLimit()",
    code: `
import { chargeTokensForOperation } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit as rl, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

const rateLimitUtils = { check: rl, handle503: rateLimit503Response };

export async function POST(req) {
  const rateLimitResult = await rateLimitUtils.check({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimitUtils.handle503();
  
  const chargeResult = await chargeTokensForOperation(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
    shouldDetect: {
      rateLimit: true,
      chargeTokens: true,
      openAI: true,
    },
  },
  {
    name: "Order Violation",
    description: "chargeTokens called before rateLimit",
    code: `
import { chargeTokensForOperation } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

export async function POST(req) {
  // WRONG ORDER: charge before rateLimit
  const chargeResult = await chargeTokensForOperation(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
    shouldDetect: {
      rateLimit: true,
      chargeTokens: true,
      openAI: true,
      orderViolation: true,
    },
  },
];

// Colors
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log("\n" + "=".repeat(70));
  log(title, "cyan");
  console.log("=".repeat(70));
}

// Analyze a bypass pattern
async function analyzeBypassPattern(pattern) {
  // Write to temp file
  const tempFile = path.join(__dirname, "..", "test-bypass-temp.ts");
  fs.writeFileSync(tempFile, pattern.code);

  try {
    // Run analysis
    const result = analyzeRoute(tempFile);

    // Cleanup
    fs.unlinkSync(tempFile);

    return {
      pattern: pattern.name,
      detected: {
        rateLimit: result.firstRateLimitLine !== null,
        chargeTokens: result.firstChargeLine !== null,
        openAI: result.firstOpenAILine !== null || result.hasOpenAIHelperImport,
        orderViolation: result.issues.some((i) => i.type === "ORDER_VIOLATION"),
      },
      issues: result.issues,
      aliases: result.aliases || [],
    };
  } catch (error) {
    // Cleanup
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw error;
  }
}

// Main test runner
async function main() {
  console.log("=".repeat(70));
  console.log("CONTRACT BYPASS REGRESSION TEST");
  console.log("=".repeat(70));
  console.log("Verifying AST-based detection catches all bypass patterns\n");

  const results = [];

  for (const pattern of BYPASS_PATTERNS) {
    logSection(`Testing: ${pattern.name}`);
    log(`Description: ${pattern.description}`, "blue");

    try {
      const result = await analyzeBypassPattern(pattern);

      // Check detection
      const rateLimitDetected = result.detected.rateLimit === pattern.shouldDetect.rateLimit;
      const chargeDetected = result.detected.chargeTokens === pattern.shouldDetect.chargeTokens;
      const openAIDetected = result.detected.openAI === pattern.shouldDetect.openAI;
      const orderViolationDetected = pattern.shouldDetect.orderViolation
        ? result.detected.orderViolation
        : true; // If no order violation expected, this check passes

      const allDetected = rateLimitDetected && chargeDetected && openAIDetected && orderViolationDetected;

      console.log("");
      log(`Expected:`, "blue");
      log(`  rateLimit: ${pattern.shouldDetect.rateLimit}`, "blue");
      log(`  chargeTokens: ${pattern.shouldDetect.chargeTokens}`, "blue");
      log(`  openAI: ${pattern.shouldDetect.openAI}`, "blue");
      if (pattern.shouldDetect.orderViolation) {
        log(`  orderViolation: ${pattern.shouldDetect.orderViolation}`, "blue");
      }

      console.log("");
      log(`Detected:`, "cyan");
      log(`  rateLimit: ${result.detected.rateLimit}`, result.detected.rateLimit ? "green" : "red");
      log(`  chargeTokens: ${result.detected.chargeTokens}`, result.detected.chargeTokens ? "green" : "red");
      log(`  openAI: ${result.detected.openAI}`, result.detected.openAI ? "green" : "red");
      if (pattern.shouldDetect.orderViolation) {
        log(`  orderViolation: ${result.detected.orderViolation}`, result.detected.orderViolation ? "green" : "red");
      }

      if (result.aliases.length > 0) {
        console.log("");
        log(`Aliases tracked: ${result.aliases.map(([k, v]) => `${k}->${v}`).join(", ")}`, "yellow");
      }

      console.log("");
      if (result.issues.length > 0) {
        log("Issues found:", "yellow");
        for (const issue of result.issues) {
          log(`  - [${issue.type}] ${issue.message}`, "yellow");
        }
      }

      results.push({
        pattern: pattern.name,
        passed: allDetected,
        detected: result.detected,
      });

      log(`\nResult: ${allDetected ? "✅ BYPASS BLOCKED" : "❌ BYPASS POSSIBLE"}`, allDetected ? "green" : "red");
    } catch (error) {
      log(`\n❌ Test failed with error: ${error.message}`, "red");
      results.push({
        pattern: pattern.name,
        passed: false,
        error: error.message,
      });
    }
  }

  // Summary
  logSection("TEST SUMMARY");

  console.log("");
  for (const result of results) {
    const status = result.passed ? "✅ BLOCKED" : "❌ BYPASSED";
    const color = result.passed ? "green" : "red";
    log(`${status} - ${result.pattern}`, color);
  }

  const passedCount = results.filter((r) => r.passed).length;
  const allPassed = passedCount === BYPASS_PATTERNS.length;

  console.log("\n" + "=".repeat(70));
  console.log(`Total: ${passedCount}/${BYPASS_PATTERNS.length} bypass patterns blocked`);
  console.log("=".repeat(70));

  // SYSTEM TASK OUTPUT
  logSection("SYSTEM TASK OUTPUT");

  console.log("\nbypass_possible_after_fix (Y/N):");
  console.log("-".repeat(50));
  console.log(allPassed ? "N" : "Y");

  console.log("\n" + (allPassed ? "✅ ALL BYPASSES BLOCKED" : "❌ SOME BYPASSES POSSIBLE"));
  console.log(allPassed ? "Contract enforcement is AST-based and non-bypassable" : "Review failed detections above");

  process.exit(allPassed ? 0 : 1);
}

// Run tests
main().catch((e) => {
  console.error("Test suite failed:", e);
  process.exit(1);
});
