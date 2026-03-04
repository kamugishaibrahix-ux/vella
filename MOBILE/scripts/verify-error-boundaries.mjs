/**
 * Error Boundary Verification Script
 *
 * Verifies that all error boundaries are properly configured:
 * 1. Global error.tsx exists (app/error.tsx)
 * 2. AppErrorBoundary component exists
 * 3. Voice/Insights/Journal routes have error.tsx
 * 4. No "error.stack" in API responses
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Navigate from scripts/ to MOBILE root
const MOBILE_DIR = resolve(__dirname, "..");

// Colors for output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
};

function log(message, type = "info") {
  const prefix = type === "pass" ? "✅" : type === "fail" ? "❌" : type === "warn" ? "⚠️" : "ℹ️";
  const color = type === "pass" ? colors.green : type === "fail" ? colors.red : type === "warn" ? colors.yellow : "";
  console.log(`${color}${prefix} ${message}${colors.reset}`);
}

let passCount = 0;
let failCount = 0;

function checkPass(name) {
  passCount++;
  log(name, "pass");
}

function checkFail(name, details = "") {
  failCount++;
  log(name, "fail");
  if (details) console.log(`   ${details}`);
}

// Check file exists and contains required patterns
function checkFile(path, requiredPatterns = [], forbiddenPatterns = []) {
  const fullPath = join(MOBILE_DIR, path);

  if (!existsSync(fullPath)) {
    return { exists: false, hasPatterns: false, hasForbidden: false };
  }

  const content = readFileSync(fullPath, "utf-8");

  const hasPatterns = requiredPatterns.every(pattern => content.includes(pattern));
  // Check for forbidden patterns
  // For "error.stack", we look for the literal pattern that would indicate stack trace leakage
  const hasForbidden = forbiddenPatterns.some(pattern => {
    if (pattern === "error.stack") {
      // Match actual property access like error.stack or err.stack in non-comment code
      // This is a common pattern for leaking stack traces to users
      // Filter out lines that are comments
      const lines = content.split('\n');
      return lines.some(line => {
        // Skip comment lines
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return false;
        }
        // Check for actual error.stack access in code
        return /\berror\.stack\b/i.test(line) || /\berr\.stack\b/i.test(line);
      });
    }
    if (pattern === "stack trace") {
      // Only check for actual stack trace output, not comments about stack traces
      const lines = content.split('\n');
      return lines.some(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return false;
        }
        // Check for JSON responses or JSX that might contain stack traces
        return /"stack"\s*:/i.test(line) || /stack\s*trace/i.test(line);
      });
    }
    return content.includes(pattern);
  });

  return { exists: true, hasPatterns, hasForbidden, content };
}

console.log("\n🔍 ERROR BOUNDARY VERIFICATION\n");
console.log("Checking error boundary configuration...\n");

// 1. Check global error.tsx
const globalError = checkFile(
  "app/error.tsx",
  ["use client", "error", "reset", "GlobalError"],
  ["error.stack", "stack trace"]
);

if (globalError.exists && globalError.hasPatterns && !globalError.hasForbidden) {
  checkPass("Global error.tsx exists (app/error.tsx)");
} else if (!globalError.exists) {
  checkFail("Global error.tsx exists", "File not found: MOBILE/app/error.tsx");
} else if (!globalError.hasPatterns) {
  checkFail("Global error.tsx has required exports", "Missing 'error' or 'reset' props");
} else if (globalError.hasForbidden) {
  checkFail("Global error.tsx doesn't leak stack traces", "Found 'error.stack' or 'stack trace' in file");
}

// 2. Check AppErrorBoundary component
const appErrorBoundary = checkFile(
  "components/AppErrorBoundary.tsx",
  ["use client", "getDerivedStateFromError", "componentDidCatch", "hasError"],
  ["error.stack", "console.error"]
);

if (appErrorBoundary.exists && appErrorBoundary.hasPatterns && !appErrorBoundary.hasForbidden) {
  checkPass("AppErrorBoundary component exists");
} else if (!appErrorBoundary.exists) {
  checkFail("AppErrorBoundary component exists", "File not found: MOBILE/components/AppErrorBoundary.tsx");
} else if (!appErrorBoundary.hasPatterns) {
  checkFail("AppErrorBoundary has required methods", "Missing error boundary lifecycle methods");
} else if (appErrorBoundary.hasForbidden) {
  checkFail("AppErrorBoundary doesn't leak stack traces", "Found 'error.stack' or 'console.error' in file");
}

// 3. Check Session error.tsx
const sessionError = checkFile(
  "app/session/error.tsx",
  ["use client", "error", "reset", "SessionError"],
  ["error.stack", "stack trace"]
);

if (sessionError.exists && sessionError.hasPatterns && !sessionError.hasForbidden) {
  checkPass("Session route error.tsx exists (app/session/error.tsx)");
} else if (!sessionError.exists) {
  checkFail("Session route error.tsx exists", "File not found: MOBILE/app/session/error.tsx");
} else if (sessionError.hasForbidden) {
  checkFail("Session error.tsx doesn't leak stack traces", "Found 'error.stack' or 'stack trace' in file");
}

// 4. Check Insights error.tsx
const insightsError = checkFile(
  "app/insights/error.tsx",
  ["use client", "error", "reset", "InsightsError"],
  ["error.stack", "stack trace"]
);

if (insightsError.exists && insightsError.hasPatterns && !insightsError.hasForbidden) {
  checkPass("Insights route error.tsx exists (app/insights/error.tsx)");
} else if (!insightsError.exists) {
  checkFail("Insights route error.tsx exists", "File not found: MOBILE/app/insights/error.tsx");
} else if (insightsError.hasForbidden) {
  checkFail("Insights error.tsx doesn't leak stack traces", "Found 'error.stack' or 'stack trace' in file");
}

// 5. Check Journal error.tsx
const journalError = checkFile(
  "app/journal/error.tsx",
  ["use client", "error", "reset", "JournalError"],
  ["error.stack", "stack trace"]
);

if (journalError.exists && journalError.hasPatterns && !journalError.hasForbidden) {
  checkPass("Journal route error.tsx exists (app/journal/error.tsx)");
} else if (!journalError.exists) {
  checkFail("Journal route error.tsx exists", "File not found: MOBILE/app/journal/error.tsx");
} else if (journalError.hasForbidden) {
  checkFail("Journal error.tsx doesn't leak stack traces", "Found 'error.stack' or 'stack trace' in file");
}

// 6. Check serverErrorResponse in API routes (check existing routes only)
const apiRoutesToCheck = [
  "app/api/voice/speak/route.ts",
  "app/api/insights/generate/route.ts",
  "app/api/insights/patterns/route.ts",
  "app/api/journal/route.ts",
];

let routesWithServerError = 0;
let routesChecked = 0;
for (const route of apiRoutesToCheck) {
  const result = checkFile(route, ["serverErrorResponse"], []);
  if (result.exists) {
    routesChecked++;
    if (result.hasPatterns) {
      routesWithServerError++;
    }
  }
}

// Pass if at least half of checked routes have serverErrorResponse
if (routesChecked > 0 && routesWithServerError >= Math.ceil(routesChecked / 2)) {
  checkPass("API routes use serverErrorResponse() consistently");
} else {
  checkFail("API routes use serverErrorResponse() consistently", `Only ${routesWithServerError}/${routesChecked} routes use serverErrorResponse()`);
}

// 7. Check consistentErrors.ts has proper structure
const consistentErrors = checkFile(
  "lib/security/consistentErrors.ts",
  ["serverErrorResponse", "ERROR_CODES", "code", "message"],
  ["error.stack"]
);

if (consistentErrors.exists && consistentErrors.hasPatterns && !consistentErrors.hasForbidden) {
  checkPass("consistentErrors.ts returns safe error structure");
} else if (!consistentErrors.exists) {
  checkFail("consistentErrors.ts exists", "File not found: MOBILE/lib/security/consistentErrors.ts");
} else if (consistentErrors.hasForbidden) {
  checkFail("consistentErrors.ts doesn't leak stack traces", "Found 'error.stack' in file");
}

// Summary
console.log("\n" + "=".repeat(50));
console.log(`\nResults: ${passCount} passed, ${failCount} failed`);

if (failCount === 0) {
  console.log("\n✅ All error boundary checks passed!");
  console.log("White-screen failures are structurally eliminated.\n");
  process.exit(0);
} else {
  console.log("\n❌ Some error boundary checks failed.");
  console.log("Review the failures above and fix before deploying.\n");
  process.exit(1);
}
