#!/usr/bin/env node
/**
 * PHASE 4.2 TOKEN LEDGER INVARIANTS VERIFICATION
 * Ensures all AI-spending routes have charge+refund pairs
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const API_ROUTES_DIR = join(PROJECT_ROOT, "app", "api");

let passed = 0;
let failed = 0;

function fail(message) {
  console.log(`  ❌ ${message}`);
  failed++;
}

function pass(message) {
  console.log(`  ✅ ${message}`);
  passed++;
}

function scanDirectory(dir, callback) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

console.log("🔍 TOKEN LEDGER INVARIANTS VERIFICATION\n");

// CHECK 1: Identify all routes that charge tokens
console.log("CHECK 1: Routes that charge tokens");
const chargingRoutes = [];
scanDirectory(API_ROUTES_DIR, (filePath) => {
  if (filePath.endsWith("route.ts")) {
    const content = readFileSync(filePath, "utf-8");
    if (content.includes("chargeTokensForOperation")) {
      const hasRefund = content.includes("refundTokensForOperation");
      const hasRequestId = content.includes("requestId");
      chargingRoutes.push({
        path: filePath,
        relativePath: relative(PROJECT_ROOT, filePath),
        hasRefund,
        hasRequestId,
        chargeCount: (content.match(/chargeTokensForOperation/g) || []).length,
        refundCount: (content.match(/refundTokensForOperation/g) || []).length,
      });
    }
  }
});

console.log(`  Found ${chargingRoutes.length} routes that charge tokens:`);
for (const route of chargingRoutes) {
  const status = route.hasRefund ? "✅ has refund" : "❌ NO REFUND";
  console.log(`    - ${route.relativePath} (${status}, charges: ${route.chargeCount}, refunds: ${route.refundCount})`);
}

// CHECK 2: Verify all charging routes have refunds
console.log("\nCHECK 2: All charging routes must have refunds");
const routesWithoutRefunds = chargingRoutes.filter(r => !r.hasRefund);
if (routesWithoutRefunds.length > 0) {
  for (const route of routesWithoutRefunds) {
    fail(`Missing refund: ${route.relativePath}`);
  }
} else {
  pass("All ${chargingRoutes.length} charging routes have refundTokensForOperation");
}

// CHECK 3: Verify requestId is used (for atomic charge/refund tracking)
console.log("\nCHECK 3: requestId tracking for atomic operations");
const routesWithoutRequestId = chargingRoutes.filter(r => !r.hasRequestId);
if (routesWithoutRequestId.length > 0) {
  for (const route of routesWithoutRequestId) {
    fail(`Missing requestId: ${route.relativePath}`);
  }
} else {
  pass("All charging routes use requestId for atomic tracking");
}

// CHECK 4: Verify specific high-value routes have comprehensive refunds
console.log("\nCHECK 4: High-value route refund audit");
const highValueRoutes = [
  { path: "app/api/transcribe/route.ts", minRefunds: 1 },
  { path: "app/api/audio/vella/route.ts", minRefunds: 1 },
  { path: "app/api/realtime/offer/route.ts", minRefunds: 1 },
  { path: "app/api/insights/generate/route.ts", minRefunds: 1 },
  { path: "app/api/insights/patterns/route.ts", minRefunds: 1 },
  { path: "app/api/vella/text/route.ts", minRefunds: 1 },
  { path: "app/api/deepdive/route.ts", minRefunds: 1 },
  { path: "app/api/reflection/route.ts", minRefunds: 1 },
  { path: "app/api/growth-roadmap/route.ts", minRefunds: 1 },
  { path: "app/api/architect/route.ts", minRefunds: 1 },
  { path: "app/api/clarity/route.ts", minRefunds: 1 },
  { path: "app/api/compass/route.ts", minRefunds: 1 },
  { path: "app/api/strategy/route.ts", minRefunds: 1 },
  { path: "app/api/emotion-intel/route.ts", minRefunds: 1 },
];

for (const route of highValueRoutes) {
  const fullPath = join(PROJECT_ROOT, route.path);
  try {
    const content = readFileSync(fullPath, "utf-8");
    const refundCount = (content.match(/refundTokensForOperation/g) || []).length;
    const hasRequestId = content.includes("requestId");
    
    if (refundCount >= route.minRefunds && hasRequestId) {
      pass(`${route.path}: ${refundCount} refund calls, requestId present`);
    } else if (refundCount < route.minRefunds) {
      fail(`${route.path}: Only ${refundCount} refunds (expected >= ${route.minRefunds})`);
    } else {
      fail(`${route.path}: Missing requestId`);
    }
  } catch (err) {
    fail(`${route.path}: File not found or unreadable`);
  }
}

// CHECK 5: Verify charge-before-OpenAI pattern
console.log("\nCHECK 5: Charge-before-OpenAI pattern verification");
let patternCheckPassed = true;
for (const route of chargingRoutes) {
  const content = readFileSync(route.path, "utf-8");
  
  // Check for the pattern: charge happens before OpenAI calls
  const chargeIndex = content.indexOf("chargeTokensForOperation");
  const openaiIndex = content.indexOf("runWithOpenAICircuit") || content.indexOf("runDeepDive") || 
                      content.indexOf("runCompassMode") || content.indexOf("runStoicStrategist") ||
                      content.indexOf("runEmotionIntelBundle") || content.indexOf("runClarityEngine") ||
                      content.indexOf("runLifeArchitect") || content.indexOf("callVellaReflectionAPI") ||
                      content.indexOf("buildGrowthRoadmapDetailed") || content.indexOf("openai.chat.completions");
  
  if (chargeIndex !== -1 && openaiIndex !== -1) {
    if (chargeIndex < openaiIndex) {
      // Good: charge happens before OpenAI
    } else {
      fail(`${route.relativePath}: charge happens AFTER OpenAI call`);
      patternCheckPassed = false;
    }
  }
}
if (patternCheckPassed) {
  pass("All routes charge before OpenAI call (correct order)");
}

// CHECK 6: Verify "charged" flag pattern for idempotency
console.log("\nCHECK 6: Idempotency flag (charged boolean) verification");
let idempotencyCheckPassed = true;
for (const route of chargingRoutes) {
  const content = readFileSync(route.path, "utf-8");
  const hasChargedFlag = content.includes("let charged = false") || content.includes("let charged=false");
  const checksChargedBeforeRefund = content.includes("if (charged)");
  
  // All routes should have the charged flag pattern
  if (!hasChargedFlag) {
    fail(`${route.relativePath}: Missing 'charged' boolean flag`);
    idempotencyCheckPassed = false;
  }
}
if (idempotencyCheckPassed) {
  pass("All routes use 'charged' flag for idempotent refunds");
}

// Summary
console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) {
  console.log("\n❌ TOKEN LEDGER INVARIANT CHECKS FAILED");
  console.log("Some routes lack proper refund protection.");
  process.exit(1);
} else {
  console.log("\n✅ All token ledger invariant checks passed!");
  console.log("Every charge has a matching refund path.");
  process.exit(0);
}
