#!/usr/bin/env node
/**
 * RLS Policy Audit Script
 * 
 * Verifies that all Supabase tables have proper Row Level Security policies.
 * Ensures production-grade security by checking:
 * - RLS is enabled on all tables
 * - Policies exist for SELECT, INSERT, UPDATE, DELETE
 * - Policies properly isolate user data (auth.uid() checks)
 * - Admin tables have admin-only policies
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

// Tables that should have RLS enabled
const REQUIRED_RLS_TABLES = [
  "profiles",
  "subscriptions",
  "token_usage",
  "token_topups",
  "user_preferences",
  "vella_settings",
  "user_goals",
  "user_goal_actions",
  "connection_depth",
  "last_active",
  "progress_metrics",
  "achievements",
  "social_models",
  "vella_personality",
  "micro_rag_cache",
  "prompt_signatures",
  "admin_ai_config",
  "user_metadata",
  "system_logs",
  "admin_activity_log",
  "feedback",
  "token_ledger",
  "analytics_counters",
  "admin_global_config",
];

// Admin-only tables (should have admin policies)
const ADMIN_ONLY_TABLES = [
  "admin_ai_config",
  "admin_global_config",
  "user_metadata",
  "system_logs",
  "admin_activity_log",
  "token_ledger",
  "analytics_counters",
];

// User-isolated tables (should check auth.uid() = user_id or id)
const USER_ISOLATED_TABLES = [
  "profiles",
  "subscriptions",
  "token_usage",
  "token_topups",
  "user_preferences",
  "vella_settings",
  "user_goals",
  "user_goal_actions",
  "connection_depth",
  "last_active",
  "progress_metrics",
  "achievements",
  "social_models",
  "vella_personality",
  "feedback",
];

function readMigrations() {
  try {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    return files.map((file) => ({
      name: file,
      content: readFileSync(join(migrationsDir, file), "utf-8"),
    }));
  } catch (error) {
    console.error(`[ERROR] Failed to read migrations: ${error.message}`);
    process.exit(1);
  }
}

function extractRLSInfo(migrations) {
  const rlsInfo = new Map();

  for (const migration of migrations) {
    const content = migration.content;

    // Find RLS enable statements
    const rlsEnableRegex = /alter\s+table\s+public\.(\w+)\s+enable\s+row\s+level\s+security/gi;
    let match;
    while ((match = rlsEnableRegex.exec(content)) !== null) {
      const table = match[1];
      if (!rlsInfo.has(table)) {
        rlsInfo.set(table, { enabled: true, policies: [], migration: migration.name });
      } else {
        rlsInfo.get(table).enabled = true;
      }
    }

    // Find policy creation statements
    const policyRegex = /create\s+policy\s+"([^"]+)"\s+on\s+public\.(\w+)\s+for\s+(\w+)\s+using\s*\(([^)]+)\)/gi;
    while ((match = policyRegex.exec(content)) !== null) {
      const [, policyName, table, operation, condition] = match;
      if (!rlsInfo.has(table)) {
        rlsInfo.set(table, { enabled: false, policies: [], migration: migration.name });
      }
      rlsInfo.get(table).policies.push({
        name: policyName,
        operation: operation.toLowerCase(),
        condition: condition.trim(),
      });
    }

    // Also catch policies with WITH CHECK
    const policyWithCheckRegex = /create\s+policy\s+"([^"]+)"\s+on\s+public\.(\w+)\s+for\s+(\w+)\s+using\s*\(([^)]+)\)\s+with\s+check\s*\(([^)]+)\)/gi;
    while ((match = policyWithCheckRegex.exec(content)) !== null) {
      const [, policyName, table, operation, usingCondition, checkCondition] = match;
      if (!rlsInfo.has(table)) {
        rlsInfo.set(table, { enabled: false, policies: [], migration: migration.name });
      }
      rlsInfo.get(table).policies.push({
        name: policyName,
        operation: operation.toLowerCase(),
        condition: usingCondition.trim(),
        checkCondition: checkCondition.trim(),
      });
    }
  }

  return rlsInfo;
}

function auditRLS(rlsInfo) {
  const issues = [];
  const warnings = [];

  // Check required tables have RLS enabled
  for (const table of REQUIRED_RLS_TABLES) {
    const info = rlsInfo.get(table);
    if (!info || !info.enabled) {
      issues.push(`[CRITICAL] Table '${table}' does not have RLS enabled`);
    }
  }

  // Check policies for user-isolated tables
  for (const table of USER_ISOLATED_TABLES) {
    const info = rlsInfo.get(table);
    if (!info || !info.enabled) {
      continue; // Already flagged above
    }

    const policies = info.policies;
    const operations = new Set(policies.map((p) => p.operation));

    // Check SELECT policy
    if (!operations.has("select")) {
      issues.push(`[CRITICAL] Table '${table}' missing SELECT policy`);
    } else {
      const selectPolicy = policies.find((p) => p.operation === "select");
      if (!selectPolicy.condition.includes("auth.uid()")) {
        warnings.push(`[WARNING] Table '${table}' SELECT policy may not properly isolate users`);
      }
    }

    // Check INSERT policy
    if (!operations.has("insert")) {
      warnings.push(`[WARNING] Table '${table}' missing INSERT policy (may be intentional)`);
    } else {
      const insertPolicy = policies.find((p) => p.operation === "insert");
      if (!insertPolicy.condition.includes("auth.uid()") && !insertPolicy.checkCondition?.includes("auth.uid()")) {
        warnings.push(`[WARNING] Table '${table}' INSERT policy may not properly isolate users`);
      }
    }

    // Check UPDATE policy
    if (!operations.has("update")) {
      warnings.push(`[WARNING] Table '${table}' missing UPDATE policy (may be intentional)`);
    } else {
      const updatePolicy = policies.find((p) => p.operation === "update");
      if (!updatePolicy.condition.includes("auth.uid()")) {
        warnings.push(`[WARNING] Table '${table}' UPDATE policy may not properly isolate users`);
      }
    }

    // Check DELETE policy
    if (!operations.has("delete")) {
      warnings.push(`[WARNING] Table '${table}' missing DELETE policy (may be intentional)`);
    } else {
      const deletePolicy = policies.find((p) => p.operation === "delete");
      if (!deletePolicy.condition.includes("auth.uid()")) {
        warnings.push(`[WARNING] Table '${table}' DELETE policy may not properly isolate users`);
      }
    }
  }

  // Check admin-only tables
  for (const table of ADMIN_ONLY_TABLES) {
    const info = rlsInfo.get(table);
    if (!info || !info.enabled) {
      continue; // Already flagged above
    }

    const policies = info.policies;
    const hasAdminCheck = policies.some(
      (p) =>
        p.condition.includes("is_admin_user()") ||
        p.condition.includes("service_role") ||
        p.checkCondition?.includes("is_admin_user()") ||
        p.checkCondition?.includes("service_role"),
    );

    if (!hasAdminCheck) {
      warnings.push(`[WARNING] Table '${table}' may not have proper admin-only restrictions`);
    }
  }

  return { issues, warnings };
}

function main() {
  console.log("🔒 RLS Policy Audit\n");

  const migrations = readMigrations();
  console.log(`📁 Found ${migrations.length} migration files\n`);

  const rlsInfo = extractRLSInfo(migrations);
  console.log(`📊 Found RLS info for ${rlsInfo.size} tables\n`);

  const { issues, warnings } = auditRLS(rlsInfo);

  // Report results
  if (issues.length === 0 && warnings.length === 0) {
    console.log("✅ All RLS policies are properly configured!\n");
    process.exit(0);
  }

  if (issues.length > 0) {
    console.log("❌ CRITICAL ISSUES:\n");
    issues.forEach((issue) => console.log(`  ${issue}`));
    console.log();
  }

  if (warnings.length > 0) {
    console.log("⚠️  WARNINGS:\n");
    warnings.forEach((warning) => console.log(`  ${warning}`));
    console.log();
  }

  // Summary
  console.log(`\n📋 Summary:`);
  console.log(`  Critical issues: ${issues.length}`);
  console.log(`  Warnings: ${warnings.length}\n`);

  if (issues.length > 0) {
    console.log("❌ Audit failed. Please fix critical issues before deploying.\n");
    process.exit(1);
  }

  console.log("⚠️  Audit completed with warnings. Review before deploying.\n");
  process.exit(0);
}

main();

