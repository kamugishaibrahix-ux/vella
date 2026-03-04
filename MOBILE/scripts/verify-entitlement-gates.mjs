#!/usr/bin/env node
/**
 * PHASE 4.1 ENTITLEMENT INTEGRITY VERIFICATION
 * Ensures all AI-spending endpoints are gated by requireEntitlement()
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

console.log("🔍 ENTITLEMENT INTEGRITY VERIFICATION\n");

// CHECK 1: Identify all AI-spending routes
console.log("CHECK 1: AI-spending endpoint inventory");
const aiRoutes = [];
scanDirectory(API_ROUTES_DIR, (filePath) => {
  if (filePath.endsWith("route.ts")) {
    const content = readFileSync(filePath, "utf-8");
    // Check for OpenAI spending patterns
    const hasChargeTokens = content.includes("chargeTokensForOperation");
    const hasCircuitBreaker = content.includes("runWithOpenAICircuit");
    const hasOpenAI = content.includes("openai") || content.includes("openai/client") || content.includes(".chat.completions");
    
    if (hasChargeTokens || hasCircuitBreaker || hasOpenAI) {
      aiRoutes.push({
        path: filePath,
        relativePath: relative(PROJECT_ROOT, filePath),
        hasChargeTokens,
        hasCircuitBreaker,
        hasOpenAI,
        hasRequireEntitlement: content.includes("requireEntitlement("),
        hasRequireUserId: content.includes("requireUserId("),
      });
    }
  }
});

console.log(`  Found ${aiRoutes.length} AI-spending routes:`);
for (const route of aiRoutes) {
  const gateType = route.hasRequireEntitlement ? "requireEntitlement" : route.hasRequireUserId ? "requireUserId" : "NONE";
  console.log(`    - ${route.relativePath} (gate: ${gateType})`);
}

// CHECK 2: Verify requireEntitlement on all AI-spending routes
console.log("\nCHECK 2: requireEntitlement() gate check");
const routesWithoutEntitlement = aiRoutes.filter(r => !r.hasRequireEntitlement);
if (routesWithoutEntitlement.length > 0) {
  for (const route of routesWithoutEntitlement) {
    fail(`Missing requireEntitlement: ${route.relativePath}`);
  }
} else {
  pass("All AI-spending routes use requireEntitlement()");
}

// CHECK 3: Verify order of operations in key routes
console.log("\nCHECK 3: Order of operations (entitlement → rateLimit → charge → OpenAI)");
let orderCheckPassed = true;
for (const route of aiRoutes) {
  if (!route.hasRequireEntitlement) continue; // Skip routes without entitlement for this check
  
  const content = readFileSync(route.path, "utf-8");
  
  // Check for correct order: requireEntitlement should come before chargeTokens and OpenAI calls
  const entitlementIndex = content.indexOf("requireEntitlement(");
  const chargeIndex = content.indexOf("chargeTokensForOperation(");
  const openaiIndex = content.indexOf("runWithOpenAICircuit(");
  
  if (entitlementIndex === -1) continue;
  
  // If charge exists, entitlement must come before
  if (chargeIndex !== -1 && entitlementIndex > chargeIndex) {
    fail(`${route.relativePath}: chargeTokensForOperation before requireEntitlement`);
    orderCheckPassed = false;
  }
  
  // If OpenAI call exists, entitlement must come before
  if (openaiIndex !== -1 && entitlementIndex > openaiIndex) {
    fail(`${route.relativePath}: OpenAI call before requireEntitlement`);
    orderCheckPassed = false;
  }
}
if (orderCheckPassed) {
  pass("Order of operations correct: entitlement → charge/OpenAI");
}

// CHECK 4: Check for admin bypass patterns
console.log("\nCHECK 4: Admin bypass check");
let adminBypassFound = false;
scanDirectory(API_ROUTES_DIR, (filePath) => {
  if (filePath.endsWith("route.ts")) {
    const content = readFileSync(filePath, "utf-8");
    // Check for suspicious patterns that might indicate admin bypass
    if (content.includes("isAdmin") && content.includes("skip")) {
      fail(`Potential admin bypass in ${relative(PROJECT_ROOT, filePath)}`);
      adminBypassFound = true;
    }
    if (content.includes("admin") && content.includes("entitlement")) {
      // This is suspicious — admin shouldn't bypass entitlement
      if (content.includes("bypass") || content.includes("skip")) {
        fail(`Admin entitlement bypass in ${relative(PROJECT_ROOT, filePath)}`);
        adminBypassFound = true;
      }
    }
  }
});
if (!adminBypassFound) {
  pass("No admin bypass patterns found");
}

// CHECK 5: Specific route audit for known high-risk endpoints
console.log("\nCHECK 5: High-risk endpoint audit");
const highRiskEndpoints = [
  { path: "app/api/transcribe/route.ts", entitlement: "transcribe", hasRefund: true },
  { path: "app/api/audio/vella/route.ts", entitlement: "audio_vella", hasRefund: true },
  { path: "app/api/realtime/token/route.ts", entitlement: "realtime_session", hasRefund: true },
  { path: "app/api/realtime/offer/route.ts", entitlement: "realtime_offer", hasRefund: true },
  { path: "app/api/insights/generate/route.ts", entitlement: "insights_generate", hasRefund: false },
  { path: "app/api/insights/patterns/route.ts", entitlement: "insights_patterns", hasRefund: true },
  { path: "app/api/vella/text/route.ts", entitlement: "chat_text", hasRefund: true },
];

for (const endpoint of highRiskEndpoints) {
  const fullPath = join(PROJECT_ROOT, endpoint.path);
  try {
    const content = readFileSync(fullPath, "utf-8");
    const hasEntitlement = content.includes(`requireEntitlement("${endpoint.entitlement}")`);
    const hasRefund = content.includes("refundTokensForOperation");
    
    if (!hasEntitlement) {
      fail(`${endpoint.path}: Missing requireEntitlement("${endpoint.entitlement}")`);
    } else {
      pass(`${endpoint.path}: Has requireEntitlement("${endpoint.entitlement}")`);
    }
    
    if (endpoint.hasRefund && !hasRefund) {
      fail(`${endpoint.path}: Missing refundTokensForOperation`);
    } else if (endpoint.hasRefund && hasRefund) {
      pass(`${endpoint.path}: Has refundTokensForOperation`);
    }
  } catch (err) {
    fail(`${endpoint.path}: File not found or unreadable`);
  }
}

// Summary
console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) {
  console.log("\n❌ ENTITLEMENT INTEGRITY CHECKS FAILED");
  console.log("Some AI-spending routes lack proper entitlement gates.");
  process.exit(1);
} else {
  console.log("\n✅ All entitlement integrity checks passed!");
  console.log("Every AI-spending path has an entitlement gate.");
  process.exit(0);
}
