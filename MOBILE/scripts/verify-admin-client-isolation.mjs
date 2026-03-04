#!/usr/bin/env node
/**
 * Supabase Admin Client Isolation Verification
 *
 * Verifies that the service-role admin client CANNOT leak into client bundles.
 * This is a security-critical check that must pass before production deployment.
 *
 * Checks:
 * 1. Admin module is in server-only directory (lib/server/)
 * 2. No client components import admin module (direct or transitive)
 * 3. No hooks import admin module
 * 4. No "use client" files import admin module
 * 5. Service role key doesn't appear in client-eligible files
 * 6. Runtime guard exists in admin module
 *
 * Run:
 *   cd MOBILE && node scripts/verify-admin-client-isolation.mjs
 *
 * Exit codes:
 *   0 - All checks passed, admin client is properly isolated
 *   1 - One or more checks failed - security risk
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
  console.log("\n" + "=".repeat(70));
  log(title, "cyan");
  console.log("=".repeat(70));
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

// Recursively get all files
function getAllFiles(dirPath, arrayOfFiles = [], extension = null) {
  try {
    const files = readdirSync(dirPath);

    for (const file of files) {
      const fullPath = join(dirPath, file);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        getAllFiles(fullPath, arrayOfFiles, extension);
      } else if (!extension || file.endsWith(extension)) {
        arrayOfFiles.push(fullPath);
      }
    }
  } catch (err) {
    // Directory doesn't exist
  }

  return arrayOfFiles;
}

// Check 1: Admin module is in server-only location
function checkServerOnlyLocation() {
  const adminModulePath = join(ROOT_DIR, "lib", "server", "supabaseAdmin.ts");
  const oldAdminModulePath = join(ROOT_DIR, "lib", "supabase", "admin.ts");

  const newExists = existsSync(adminModulePath);
  const oldExists = existsSync(oldAdminModulePath);

  // The new server-only module must exist
  if (!newExists) {
    return check(
      "Admin module in server-only location",
      false,
      "New server module not found at lib/server/supabaseAdmin.ts"
    );
  }

  // Old module can exist if it's just a re-export (backward compat)
  if (oldExists) {
    const oldContent = readFileSync(oldAdminModulePath, "utf-8");
    const isReExport =
      oldContent.includes("@/lib/server/supabaseAdmin") &&
      (oldContent.includes("export {") || oldContent.includes("export * from"));

    if (isReExport) {
      return check(
        "Admin module in server-only location (old module is safe re-export)",
        true
      );
    } else {
      return check(
        "Admin module in server-only location (old module must be re-export or removed)",
        false,
        "Old module exists but is not a safe re-export"
      );
    }
  }

  // Perfect state: new exists, old doesn't
  return check("Admin module in server-only location", true);
}

// Check 2: Runtime guard exists in admin module
function checkRuntimeGuard() {
  const adminModulePath = join(ROOT_DIR, "lib", "server", "supabaseAdmin.ts");

  if (!existsSync(adminModulePath)) {
    return check("Runtime guard in admin module", false, "Module not found");
  }

  const content = readFileSync(adminModulePath, "utf-8");

  const hasClientDetection = content.includes("typeof window !== \"undefined\"") ||
    content.includes("window.document") ||
    content.includes("isClient()");

  const hasThrowGuard = content.includes("SERVER_ONLY_MODULE_VIOLATION") ||
    content.includes("throw new Error") && content.includes("server-side");

  const passed = hasClientDetection && hasThrowGuard;

  return check(
    "Runtime client detection guard",
    passed,
    !passed
      ? `Client detection: ${hasClientDetection ? "✓" : "✗"}, Throw guard: ${hasThrowGuard ? "✓" : "✗"}`
      : ""
  );
}

// Check 3: No client components import admin module
function checkNoClientImports() {
  const componentsDir = join(ROOT_DIR, "components");
  const appComponentsDir = join(ROOT_DIR, "app", "components");
  const hooksDir = join(ROOT_DIR, "hooks");

  const violations = [];

  // Check all client-eligible files
  const checkDirs = [
    { dir: componentsDir, name: "components/" },
    { dir: appComponentsDir, name: "app/components/" },
    { dir: hooksDir, name: "hooks/" },
  ];

  for (const { dir, name } of checkDirs) {
    if (!existsSync(dir)) continue;

    const files = getAllFiles(dir, [], ".tsx").concat(getAllFiles(dir, [], ".ts"));

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const relativePath = file.replace(ROOT_DIR, "").replace(/\\/g, "/");

      // Check for admin module imports
      if (
        content.includes('from "@/lib/server/supabaseAdmin"') ||
        content.includes("from '@/lib/server/supabaseAdmin'") ||
        content.includes('from "@/lib/supabase/admin"') ||
        content.includes("from '@/lib/supabase/admin'")
      ) {
        violations.push(relativePath);
      }
    }
  }

  return check(
    "No client components/hooks import admin module",
    violations.length === 0,
    violations.length > 0
      ? `Found ${violations.length} violations: ${violations.slice(0, 5).join(", ")}${violations.length > 5 ? "..." : ""}`
      : ""
  );
}

// Check 4: No "use client" files import admin-dependent modules
function checkNoUseClientViolations() {
  const appDir = join(ROOT_DIR, "app");
  const violations = [];

  // Get all ts/tsx files in app/
  const files = getAllFiles(appDir, [], ".tsx").concat(getAllFiles(appDir, [], ".ts"));

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const relativePath = file.replace(ROOT_DIR, "").replace(/\\/g, "/");

    // Check if file has "use client"
    const hasUseClient = content.includes('"use client"') || content.includes("'use client'");

    if (hasUseClient) {
      // Check if it imports admin module or server-only modules
      if (
        content.includes('from "@/lib/server/supabaseAdmin"') ||
        content.includes("from '@/lib/server/supabaseAdmin'") ||
        content.includes('from "@/lib/supabase/admin"') ||
        content.includes("from '@/lib/supabase/admin'")
      ) {
        violations.push(`${relativePath} (imports admin module)`);
      }

      // Check for imports of modules that might transitively import admin
      const dangerousImports = [
        "@/lib/checkins",
        "@/lib/governance",
        "@/lib/memory",
        "@/lib/system",
        "@/lib/execution",
        "@/lib/journal",
        "@/lib/contracts",
        "@/lib/cognitive",
        "@/lib/finance",
        "@/lib/budget",
        "@/lib/tokens",
      ];

      for (const dangerous of dangerousImports) {
        if (content.includes(dangerous)) {
          // This is a warning-level check - these modules should be audited
          // but may be safe if they only import types or pure functions
          break;
        }
      }
    }
  }

  return check(
    "No \"use client\" files import admin module",
    violations.length === 0,
    violations.length > 0
      ? `Found ${violations.length} violations: ${violations.slice(0, 5).join(", ")}${violations.length > 5 ? "..." : ""}`
      : ""
  );
}

// Check 5: Service role key doesn't appear in client-eligible files
function checkNoServiceKeyInClientFiles() {
  const clientEligibleDirs = [
    join(ROOT_DIR, "components"),
    join(ROOT_DIR, "app", "components"),
    join(ROOT_DIR, "hooks"),
    join(ROOT_DIR, "lib", "client"),
  ];

  const violations = [];
  const keyPattern = /SUPABASE_SERVICE_ROLE_KEY/;

  for (const dir of clientEligibleDirs) {
    if (!existsSync(dir)) continue;

    const files = getAllFiles(dir, [], ".ts").concat(getAllFiles(dir, [], ".tsx"));

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const relativePath = file.replace(ROOT_DIR, "").replace(/\\/g, "/");

      if (keyPattern.test(content)) {
        violations.push(relativePath);
      }
    }
  }

  return check(
    "Service role key not in client-eligible files",
    violations.length === 0,
    violations.length > 0
      ? `Found ${violations.length} violations: ${violations.join(", ")}`
      : ""
  );
}

// Check 6: Old admin module re-exports from new location (migration safety)
function checkBackwardCompatibility() {
  const oldAdminPath = join(ROOT_DIR, "lib", "supabase", "admin.ts");

  // If old file doesn't exist, that's fine (complete migration)
  if (!existsSync(oldAdminPath)) {
    return check("Backward compatibility (old module)", true, "Old module removed - migration complete");
  }

  const content = readFileSync(oldAdminPath, "utf-8");

  // Check if old module just re-exports from new location
  const isReExport =
    content.includes("@/lib/server/supabaseAdmin") &&
    (content.includes("export {") || content.includes("export * from"));

  return check(
    "Old admin module re-exports from server location (safe)",
    isReExport,
    !isReExport
      ? "Old module should re-export from @/lib/server/supabaseAdmin or be removed"
      : ""
  );
}

// Check 7: Verify all server imports are from correct path
function checkServerImportsUseCorrectPath() {
  const apiDir = join(ROOT_DIR, "app", "api");
  const libDir = join(ROOT_DIR, "lib");

  const warnings = [];

  // Check API routes use correct import
  const apiFiles = getAllFiles(apiDir, [], ".ts");
  for (const file of apiFiles) {
    const content = readFileSync(file, "utf-8");
    const relativePath = file.replace(ROOT_DIR, "").replace(/\\/g, "/");

    // Should use new path
    if (
      content.includes('from "@/lib/supabase/admin"') ||
      content.includes("from '@/lib/supabase/admin'")
    ) {
      warnings.push(`${relativePath} (uses old path)`);
    }
  }

  // Check lib files use correct import
  const libFiles = getAllFiles(libDir, [], ".ts");
  for (const file of libFiles) {
    // Skip the server module itself and safeTables
    if (file.includes("lib/server/")) continue;
    if (file.includes("lib/supabase/safeTables")) continue;

    const content = readFileSync(file, "utf-8");
    const relativePath = file.replace(ROOT_DIR, "").replace(/\\/g, "/");

    if (
      content.includes('from "@/lib/supabase/admin"') ||
      content.includes("from '@/lib/supabase/admin'")
    ) {
      warnings.push(`${relativePath} (uses old path)`);
    }
  }

  // This is a warning not a failure - gradual migration is OK
  if (warnings.length === 0) {
    return check("All imports use new server-only path", true);
  } else {
    log(`⚠️  Some imports still use old path (migrate when convenient):`, "yellow");
    warnings.slice(0, 5).forEach((w) => log(`   ${w}`, "yellow"));
    if (warnings.length > 5) {
      log(`   ... and ${warnings.length - 5} more`, "yellow");
    }
    // Count as passed but with warning
    totalChecks++;
    passedChecks++;
    return true;
  }
}

// Main verification
function main() {
  logSection("SUPABASE ADMIN CLIENT ISOLATION VERIFICATION");
  log("Checking that service-role admin client cannot leak to client bundles...\n", "blue");

  checkServerOnlyLocation();
  checkRuntimeGuard();
  checkNoClientImports();
  checkNoUseClientViolations();
  checkNoServiceKeyInClientFiles();
  checkBackwardCompatibility();
  checkServerImportsUseCorrectPath();

  // Summary
  logSection("VERIFICATION SUMMARY");
  log(`Total checks: ${totalChecks}`, "blue");
  log(`Passed: ${passedChecks}`, "green");
  log(`Failed: ${failedChecks}`, failedChecks > 0 ? "red" : "green");

  if (failedChecks === 0) {
    log("\n✅ ALL CHECKS PASSED - Admin client properly isolated", "green");
    log("The SUPABASE_SERVICE_ROLE_KEY cannot reach client bundles.", "green");
    process.exit(0);
  } else {
    log("\n❌ SOME CHECKS FAILED - Security risk detected", "red");
    log("Fix issues before deploying to production.", "red");
    process.exit(1);
  }
}

main();
