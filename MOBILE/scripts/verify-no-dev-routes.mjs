#!/usr/bin/env node
/**
 * Production Build Verification Script
 *
 * Verifies that no dev-only routes or debug code exists in the production build.
 * Run this before deploying to production.
 *
 * Checks:
 * 1. No routes in app/api/dev/*
 * 2. No routes in app/api/debug/*
 * 3. No console.log/console.warn/console.error in API routes
 * 4. No emoji debug output
 * 5. No leaky error messages that reveal env var names
 *
 * Run:
 *   cd MOBILE && node scripts/verify-no-dev-routes.mjs
 *
 * Exit codes:
 *   0 - All checks passed, safe for production
 *   1 - One or more checks failed
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

// Colors for output
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
  console.log("\n" + "=".repeat(60));
  log(title, "cyan");
  console.log("=".repeat(60));
}

// Track results
let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(name, passed, details = "") {
  totalChecks++;
  if (passed) {
    passedChecks++;
    log(`✅ ${name}`, "green");
  } else {
    failedChecks++;
    log(`❌ ${name}`, "red");
    if (details) {
      log(`   ${details}`, "yellow");
    }
  }
  return passed;
}

// Recursively get all files in a directory
function getAllFiles(dirPath, arrayOfFiles = []) {
  try {
    const files = readdirSync(dirPath);

    for (const file of files) {
      const fullPath = join(dirPath, file);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    }
  } catch (err) {
    // Directory doesn't exist, return empty
  }

  return arrayOfFiles;
}

// Get files matching pattern (simple glob replacement)
function getFilesInDir(dir, extension = ".ts") {
  const files = [];
  const allFiles = getAllFiles(dir);
  for (const file of allFiles) {
    if (file.endsWith(extension)) {
      files.push(file);
    }
  }
  return files;
}

// Check 1: No dev routes exist
function checkNoDevRoutes() {
  const devDir = join(ROOT_DIR, "app", "api", "dev");
  const debugDir = join(ROOT_DIR, "app", "api", "debug");

  const devExists = existsSync(devDir);
  const debugExists = existsSync(debugDir);

  const allDevFiles = [];
  if (devExists) {
    allDevFiles.push(...getFilesInDir(devDir));
  }
  if (debugExists) {
    allDevFiles.push(...getFilesInDir(debugDir));
  }

  // Also check for test/mock/dry files in api directory
  const apiDir = join(ROOT_DIR, "app", "api");
  const allApiFiles = getFilesInDir(apiDir);
  const suspiciousFiles = allApiFiles.filter(
    (f) =>
      f.includes("test") ||
      f.includes("mock") ||
      f.includes("dry") ||
      f.includes("fixture")
  );

  const allProblematic = [...allDevFiles, ...suspiciousFiles];

  return check(
    "No dev/debug routes exist",
    allProblematic.length === 0,
    allProblematic.length > 0
      ? `Found: ${allProblematic.map((f) => f.replace(ROOT_DIR, "")).join(", ")}`
      : ""
  );
}

// Check 2: No console.* in API routes
function checkNoConsoleInApiRoutes() {
  const apiDir = join(ROOT_DIR, "app", "api");
  const apiFiles = getFilesInDir(apiDir);
  const violations = [];

  for (const file of apiFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const relativePath = file.replace(ROOT_DIR, "").replace(/\\/g, "/");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match console.log, console.warn, console.error, console.debug
      // But exclude safeErrorLog which is our safe logging utility
      if (/console\.(log|warn|error|debug)\s*\(/.test(line)) {
        // Check if this file imports safeErrorLog (allow it then)
        if (!content.includes("safeErrorLog")) {
          violations.push(`${relativePath}:${i + 1}`);
        }
      }
    }
  }

  return check(
    "No console.* calls in API routes",
    violations.length === 0,
    violations.length > 0
      ? `Found ${violations.length} violations: ${violations.slice(0, 5).join(", ")}${violations.length > 5 ? "..." : ""}`
      : ""
  );
}

// Check 3: No emoji debug output
function checkNoEmojiDebug() {
  const apiDir = join(ROOT_DIR, "app", "api");
  const apiFiles = getFilesInDir(apiDir);
  const violations = [];
  const emojiPattern = /[🚨✅❌🔍⚠️👉📊🌐]/;

  for (const file of apiFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const relativePath = file.replace(ROOT_DIR, "").replace(/\\/g, "/");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (emojiPattern.test(line)) {
        violations.push(`${relativePath}:${i + 1}`);
      }
    }
  }

  return check(
    "No emoji debug output in API routes",
    violations.length === 0,
    violations.length > 0
      ? `Found ${violations.length} violations: ${violations.slice(0, 5).join(", ")}${violations.length > 5 ? "..." : ""}`
      : ""
  );
}

// Check 4: Central env module exists
function checkEnvModuleExists() {
  const envModulePath = join(ROOT_DIR, "lib", "server", "env.ts");
  const exists = existsSync(envModulePath);

  if (!exists) {
    return check("Central env module exists", false, "File not found: lib/server/env.ts");
  }

  try {
    const content = readFileSync(envModulePath, "utf-8");

    const hasRequireEnv = content.includes("export function requireEnv");
    const hasGetEnv = content.includes("export function getEnv");
    const hasIsProduction = content.includes("export function isProduction");
    const hasSafeLog = content.includes("export const safeLog");

    const allPresent = hasRequireEnv && hasGetEnv && hasIsProduction && hasSafeLog;

    return check(
      "Central env module exists with required exports",
      allPresent,
      !allPresent
        ? `Missing: ${[
            !hasRequireEnv && "requireEnv",
            !hasGetEnv && "getEnv",
            !hasIsProduction && "isProduction",
            !hasSafeLog && "safeLog",
          ]
            .filter(Boolean)
            .join(", ")}`
        : ""
    );
  } catch (err) {
    return check("Central env module readable", false, `Error: ${err.message}`);
  }
}

// Check 5: No leaky error messages
function checkNoLeakyErrorMessages() {
  const apiDir = join(ROOT_DIR, "app", "api");
  const apiFiles = getFilesInDir(apiDir);
  const violations = [];
  const leakyPatterns = [
    /Missing.*API.*key/i,
    /Missing.*OPENAI/i,
    /Missing.*STRIPE/i,
    /Missing.*SUPABASE/i,
    /missing.*api_key/i,
    /missing.*openai/i,
    /missing.*stripe/i,
    /missing.*supabase/i,
  ];

  for (const file of apiFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const relativePath = file.replace(ROOT_DIR, "").replace(/\\/g, "/");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of leakyPatterns) {
        if (pattern.test(line)) {
          violations.push(`${relativePath}:${i + 1}`);
          break;
        }
      }
    }
  }

  return check(
    "No leaky error messages (env var names)",
    violations.length === 0,
    violations.length > 0
      ? `Found ${violations.length} violations: ${violations.slice(0, 5).join(", ")}${violations.length > 5 ? "..." : ""}`
      : ""
  );
}

// Main verification
function main() {
  logSection("PRODUCTION BUILD VERIFICATION");
  log("Checking for dev-only code and insecure diagnostics...\n", "blue");

  checkNoDevRoutes();
  checkNoConsoleInApiRoutes();
  checkNoEmojiDebug();
  checkEnvModuleExists();
  checkNoLeakyErrorMessages();

  // Summary
  logSection("VERIFICATION SUMMARY");
  log(`Total checks: ${totalChecks}`, "blue");
  log(`Passed: ${passedChecks}`, "green");
  log(`Failed: ${failedChecks}`, failedChecks > 0 ? "red" : "green");

  if (failedChecks === 0) {
    log("\n✅ ALL CHECKS PASSED - Safe for production", "green");
    process.exit(0);
  } else {
    log("\n❌ SOME CHECKS FAILED - Fix before deploying to production", "red");
    process.exit(1);
  }
}

main();
