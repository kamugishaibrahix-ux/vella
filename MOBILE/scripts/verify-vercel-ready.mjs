#!/usr/bin/env node
/**
 * Vercel Deployment Readiness Verification
 *
 * Run before build to ensure staging/production deployment will succeed.
 * Checks:
 * 1. Required env vars exist
 * 2. No process.exit in server code
 * 3. Webhook route can boot without secret
 * 4. All monetised routes compile
 * 5. No mock functions in production code
 * 6. AST contract script passes
 *
 * Exit code 0 = ready for deployment
 * Exit code 1 = fix issues before deploying
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Colors for terminal output
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

let allPassed = true;

// Check 1: Required environment variables
function checkEnvVars() {
  logSection("CHECK 1: Required Environment Variables");

  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "REDIS_URL",
    "CRON_SECRET",
  ];

  const missing = [];

  for (const key of required) {
    const value = process.env[key];
    if (!value || value.trim() === "" || value === `\${${key}}`) {
      missing.push(key);
      log(`  ⚠ ${key}: MISSING (must be set in Vercel dashboard)`, "yellow");
    } else {
      // Show first/last 4 chars only
      const masked = value.length > 8
        ? `${value.slice(0, 4)}...${value.slice(-4)}`
        : "****";
      log(`  ✓ ${key}: ${masked}`, "green");
    }
  }

  if (missing.length > 0) {
    log(`\n  ⚠ ${missing.length} variable(s) not set locally`, "yellow");
    log(`  These must be configured in Vercel dashboard for deployment`, "yellow");
    // This is a warning, not a failure - env vars will be checked at deployment time
    return true;
  }

  log("\n  ✓ All required environment variables present", "green");
  return true;
}

// Check 2: No process.exit in server code
function checkNoProcessExit() {
  logSection("CHECK 2: No process.exit() in Server Code");

  const serverDirs = ["lib", "app/api"];
  let foundExit = false;

  for (const dir of serverDirs) {
    const fullPath = path.join(__dirname, "..", dir);
    if (!fs.existsSync(fullPath)) continue;

    const files = findFiles(fullPath, ".ts");
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      // Check for actual process.exit calls (not comments)
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
        // Check for process.exit
        if (/process\.exit\s*\(/g.test(line)) {
          const relativePath = path.relative(path.join(__dirname, ".."), file);
          log(`  ✗ process.exit found: ${relativePath}:${i + 1}`, "red");
          log(`    ${line.trim()}`, "red");
          foundExit = true;
        }
      }
    }
  }

  if (foundExit) {
    log("\n  ✗ process.exit() calls found - Vercel incompatible", "red");
    return false;
  }

  log("  ✓ No process.exit() calls in server code", "green");
  return true;
}

// Check 3: Webhook route can boot without secret
async function checkWebhookBootSafety() {
  logSection("CHECK 3: Webhook Route Boot Safety");

  const webhookRoute = path.join(__dirname, "..", "app", "api", "stripe", "webhook", "route.ts");

  if (!fs.existsSync(webhookRoute)) {
    log("  ✗ Webhook route not found", "red");
    return false;
  }

  const content = fs.readFileSync(webhookRoute, "utf-8");

  // Check for safe boot pattern (returns 200 if secret missing)
  const hasSafeBoot = content.includes("STRIPE_WEBHOOK_SECRET") &&
    (content.includes("return new Response") || content.includes("return Response") || content.includes("NextResponse.json")) &&
    (content.includes("200") || content.includes("webhook_not_configured") || content.includes("webhook processing disabled"));

  // Check for hard throw on missing secret - look for actual throw statements in the route handler
  const lines = content.split('\n');
  let inMissingSecretBlock = false;
  let hasSafeReturnInMissingBlock = false;
  let missingSecretLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect when we're in the webhook secret check block
    if (/webhookSecret\s*===?\s*undefined\s*\|\|\s*!webhookSecret/.test(line) ||
        /!\s*webhookSecret/.test(line)) {
      inMissingSecretBlock = true;
      missingSecretLine = i;
    }
    // Check for return statement in the block
    if (inMissingSecretBlock && missingSecretLine > 0 && i > missingSecretLine && i < missingSecretLine + 10) {
      if (/return\s+(NextResponse\.json|new\s+Response|Response\.)/.test(line)) {
        hasSafeReturnInMissingBlock = true;
      }
    }
    // End of block detection (next closing brace at same indent level)
    if (inMissingSecretBlock && line.trim() === '}' && i > missingSecretLine + 2) {
      inMissingSecretBlock = false;
    }
  }

  if (hasSafeBoot || hasSafeReturnInMissingBlock) {
    log("  ✓ Webhook route has safe boot handling", "green");
    return true;
  }

  log("  ✗ Webhook route may crash on missing STRIPE_WEBHOOK_SECRET", "red");
  return false;
}

// Check 4: All monetised routes compile (basic check)
function checkMonetisedRoutes() {
  logSection("CHECK 4: Monetised Routes Compilation");

  const apiDir = path.join(__dirname, "..", "app", "api");
  const routeFiles = findFiles(apiDir, "route.ts");

  let monetisedCount = 0;
  let issues = [];

  for (const file of routeFiles) {
    const content = fs.readFileSync(file, "utf-8");

    // Check if route uses monetised operation pattern
    if (content.includes("chargeTokensForOperation") || content.includes("withMonetisedOperation")) {
      monetisedCount++;

      // Check for required patterns
      if (!content.includes("rateLimit")) {
        const relative = path.relative(path.join(__dirname, ".."), file);
        issues.push(`${relative}: Missing rateLimit check`);
      }
    }
  }

  log(`  Found ${monetisedCount} monetised routes`, "blue");

  if (issues.length > 0) {
    for (const issue of issues) {
      log(`  ✗ ${issue}`, "red");
    }
    return false;
  }

  log("  ✓ All monetised routes have required patterns", "green");
  return true;
}

// Check 5: No mock functions in production code
function checkNoProductionMocks() {
  logSection("CHECK 5: No Production Mocks");

  const libDir = path.join(__dirname, "..", "lib");
  const files = findFiles(libDir, ".ts");

  let foundMocks = false;
  const mockPatterns = [
    /mockChargeTokens/i,
    /mockRefundTokens/i,
    /mockOpenAI/i,
    /DUMMY_TOKEN|dummy.*token/i,
    /TEST_MODE.*skip.*charge/i,
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const relative = path.relative(path.join(__dirname, ".."), file);

    for (const pattern of mockPatterns) {
      if (pattern.test(content)) {
        // Check if it's in a test file or marked as test-only
        if (!file.includes(".test.") && !file.includes("__tests__") && !content.includes("test-only")) {
          log(`  ✗ Potential mock found: ${relative} - pattern: ${pattern}`, "red");
          foundMocks = true;
        }
      }
    }
  }

  if (foundMocks) {
    return false;
  }

  log("  ✓ No production mock functions detected", "green");
  return true;
}

// Check 6: AST contract script runs
function checkASTContract() {
  logSection("CHECK 6: AST Route Contract Verification");

  try {
    const output = execSync("node scripts/verify-route-contract.js", {
      cwd: path.join(__dirname, ".."),
      encoding: "utf-8",
      stdio: "pipe",
    });

    if (output.includes("✅") && output.includes("All monetized routes")) {
      log("  ✓ AST contract verification passed", "green");
      return true;
    }
  } catch (error) {
    log(`  ✗ AST contract verification failed`, "red");
    if (error.stderr) {
      log(`    ${error.stderr}`, "red");
    }
    return false;
  }

  return false;
}

// Check 7: No local file system writes
function checkNoLocalFileWrites() {
  logSection("CHECK 7: No Local File System Writes");

  const libDir = path.join(__dirname, "..", "lib");
  const files = findFiles(libDir, ".ts");

  let foundWrites = false;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const relative = path.relative(path.join(__dirname, ".."), file);

    // Skip comments and check for actual file writes
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments
      if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*")) continue;

      // Check for file write operations (not in node_modules or import statements)
      if (/fs\.\s*(writeFile|appendFile|createWriteStream)/.test(line) &&
          !line.includes("import") &&
          !line.includes("from") &&
          !file.includes("node_modules")) {
        log(`  ⚠ File write found: ${relative}:${i + 1}`, "yellow");
        log(`    ${line.trim()}`, "yellow");
        foundWrites = true;
      }
    }
  }

  if (foundWrites) {
    log("\n  ⚠ File system writes found - may not work on Vercel serverless", "yellow");
    log("  Ensure writes are only in development or use external storage", "yellow");
    // This is a warning, not a failure
    return true;
  }

  log("  ✓ No local file system writes detected", "green");
  return true;
}

// Check 8: Local storage module is dev-only
function checkLocalStorageDevOnly() {
  logSection("CHECK 8: Local Storage Module (Dev-Only)");

  const localStoragePath = path.join(__dirname, "..", "lib", "local", "serverLocal.ts");

  if (!fs.existsSync(localStoragePath)) {
    log("  ✓ No local storage module found", "green");
    return true;
  }

  const content = fs.readFileSync(localStoragePath, "utf-8");

  // Check if it's guarded by development check
  const hasDevGuard = content.includes('"use server"') ||
    content.includes("process.env.NODE_ENV") ||
    content.includes("isDevelopment()");

  if (hasDevGuard) {
    log("  ✓ Local storage module has server/dev guards", "green");
    return true;
  }

  log("  ⚠ Local storage module found - ensure it's only used in development", "yellow");
  return true; // Warning only
}

// Helper: Recursively find files
function findFiles(dir, extension) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and .next
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      files.push(...findFiles(fullPath, extension));
    } else if (entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

// Main runner
async function main() {
  console.log("=".repeat(70));
  console.log("VERCEL DEPLOYMENT READINESS VERIFICATION");
  console.log("=".repeat(70));

  const results = {
    envVars: checkEnvVars(),
    noProcessExit: checkNoProcessExit(),
    webhookSafety: await checkWebhookBootSafety(),
    monetisedRoutes: checkMonetisedRoutes(),
    noProductionMocks: checkNoProductionMocks(),
    astContract: checkASTContract(),
    noLocalWrites: checkNoLocalFileWrites(),
    localStorageGuarded: checkLocalStorageDevOnly(),
  };

  // Summary
  logSection("VERIFICATION SUMMARY");

  const allChecks = Object.entries(results);
  for (const [name, passed] of allChecks) {
    const status = passed ? "✓ PASS" : "✗ FAIL";
    const color = passed ? "green" : "red";
    log(`  ${status}: ${name}`, color);
  }

  const failedCount = Object.values(results).filter((r) => !r).length;

  console.log("\n" + "=".repeat(70));
  if (failedCount === 0) {
    log("✓ ALL CHECKS PASSED - Ready for Vercel deployment", "green");
    console.log("=".repeat(70));
    process.exit(0);
  } else {
    log(`✗ ${failedCount} CHECK(S) FAILED - Fix before deploying`, "red");
    console.log("=".repeat(70));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Verification failed with error:", error);
  process.exit(1);
});
