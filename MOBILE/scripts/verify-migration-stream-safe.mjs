#!/usr/bin/env node
/**
 * verify-migration-stream-safe.mjs
 *
 * Asserts that the active Supabase migration stream (supabase/migrations/) is safe:
 * - token_usage_idempotency runs before atomic_token_deduct
 * - atomic_token_deduct runs before token_ledger_write_firewall
 * - webhook_events migration exists before 20260244_stripe_webhook_idempotency_hardening
 * - no DROP COLUMN migrations in supabase/migrations
 *
 * Exit 0 on PASS, 1 on FAIL. No external services.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

function getSortedMigrations() {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function fail(msg) {
  console.error("[verify-migration-stream-safe] FAIL:", msg);
  process.exit(1);
}

function pass() {
  console.log("[verify-migration-stream-safe] PASS: Migration stream is safe.");
  process.exit(0);
}

function main() {
  const files = getSortedMigrations();
  if (files.length === 0) {
    console.warn("[verify-migration-stream-safe] No migrations found in supabase/migrations/");
    pass();
    return;
  }

  const idx = (name) => files.findIndex((f) => f.includes(name));

  // 1) token_usage_idempotency before atomic_token_deduct
  const idempotencyIdx = idx("token_usage_idempotency");
  const atomicDeductIdx = idx("atomic_token_deduct");
  if (idempotencyIdx >= 0 && atomicDeductIdx >= 0 && idempotencyIdx >= atomicDeductIdx) {
    fail(
      "token_usage_idempotency must run before atomic_token_deduct. " +
        `Found: ${files[atomicDeductIdx]} at ${atomicDeductIdx}, ${files[idempotencyIdx]} at ${idempotencyIdx}.`
    );
  }

  // 2) atomic_token_deduct before token_ledger_write_firewall
  const firewallIdx = idx("token_ledger_write_firewall");
  if (atomicDeductIdx >= 0 && firewallIdx >= 0 && atomicDeductIdx >= firewallIdx) {
    fail(
      "atomic_token_deduct must run before token_ledger_write_firewall. " +
        `Found: ${files[firewallIdx]} at ${firewallIdx}, ${files[atomicDeductIdx]} at ${atomicDeductIdx}.`
    );
  }

  // 3) webhook_events migration before 20260244_stripe_webhook_idempotency_hardening
  const webhookEventsIdx = files.findIndex((f) => f.includes("webhook_events") && f.endsWith(".sql"));
  const stripeHardeningIdx = files.findIndex((f) => f.includes("20260244") && f.includes("stripe_webhook_idempotency_hardening"));
  if (stripeHardeningIdx >= 0) {
    if (webhookEventsIdx < 0) {
      fail("webhook_events migration must exist before 20260244_stripe_webhook_idempotency_hardening. No webhook_events migration found.");
    }
    if (webhookEventsIdx >= stripeHardeningIdx) {
      fail(
        "webhook_events migration must run before 20260244_stripe_webhook_idempotency_hardening. " +
          `Found: ${files[webhookEventsIdx]} at ${webhookEventsIdx}, ${files[stripeHardeningIdx]} at ${stripeHardeningIdx}.`
      );
    }
  }

  // 4) no DROP COLUMN in supabase/migrations
  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const withoutLineComments = content.replace(/--[^\n]*/g, "");
    if (/\bdrop\s+column\b/i.test(withoutLineComments)) {
      const lines = content.split(/\r?\n/);
      const lineNum = lines.findIndex((l) => /\bdrop\s+column\b/i.test(l.replace(/--.*$/, "")));
      fail(
        `DROP COLUMN not allowed in migrations: ${file}${lineNum >= 0 ? " line " + (lineNum + 1) : ""}. Move to runbook-sql.`
      );
    }
  }

  pass();
}

main();
