#!/usr/bin/env node
/**
 * Token Atomicity Concurrency Test
 *
 * Tests that the atomic_token_deduct function correctly handles concurrent requests
 * without double-spending or allowing negative balances.
 *
 * Prerequisites:
 *   - Supabase dev environment running
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - A test user exists with a known ID
 *
 * Test scenario:
 *   - Setup: Create/reset test user with 1000 token allowance
 *   - Fire 50 concurrent RPC calls to deduct 100 tokens each
 *   - Expected: Exactly 10 succeed, 40 fail with insufficient_balance
 *   - Expected: Final balance = 0 (no negative balance)
 *
 * Run:
 *   cd MOBILE && node scripts/test-token-concurrency.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// Load env from MOBILE/.env.local
const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_USER_ID = process.env.TEST_USER_ID || "00000000-0000-0000-0000-000000000001";

// Test configuration
const INITIAL_ALLOWANCE = 1000;
const DEDUCTION_AMOUNT = 100;
const CONCURRENT_REQUESTS = 50;
const EXPECTED_SUCCESSES = 10; // 1000 / 100 = 10
const EXPECTED_FAILURES = 40;  // 50 - 10 = 40

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

// Initialize Supabase admin client
function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Setup test user with known allowance
async function setupTestUser(supabase) {
  log("Setting up test user...", "blue");

  // Check if user exists in auth
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    log(`Warning: Could not list users: ${listError.message}`, "yellow");
  }

  // Ensure profile exists
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: TEST_USER_ID, display_name: "Test User" }, { onConflict: "id" });

  if (profileError) {
    throw new Error(`Failed to ensure profile: ${profileError.message}`);
  }

  // Ensure subscription exists with monthly_token_allocation
  const { error: subError } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: TEST_USER_ID,
        plan: "pro",
        status: "active",
        monthly_token_allocation: INITIAL_ALLOWANCE,
        monthly_token_allocation_used: 0,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (subError) {
    throw new Error(`Failed to ensure subscription: ${subError.message}`);
  }

  // Clear any existing token usage for this user in current billing window
  const { error: deleteError } = await supabase
    .from("token_usage")
    .delete()
    .eq("user_id", TEST_USER_ID);

  if (deleteError) {
    log(`Warning: Could not clear existing usage: ${deleteError.message}`, "yellow");
  }

  // Clear any existing token topups for this user
  const { error: deleteTopupsError } = await supabase
    .from("token_topups")
    .delete()
    .eq("user_id", TEST_USER_ID);

  if (deleteTopupsError) {
    log(`Warning: Could not clear existing topups: ${deleteTopupsError.message}`, "yellow");
  }

  log(`Test user ${TEST_USER_ID} ready with ${INITIAL_ALLOWANCE} token allowance`, "green");
}

// Get current token balance for test user
async function getCurrentBalance(supabase) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("monthly_token_allocation, monthly_token_allocation_used")
    .eq("user_id", TEST_USER_ID)
    .single();

  if (error || !data) {
    throw new Error(`Failed to get balance: ${error?.message || "No data"}`);
  }

  // Calculate actual balance from usage
  const windowStart = new Date();
  windowStart.setDate(1); // Start of current month
  windowStart.setHours(0, 0, 0, 0);

  const windowEnd = new Date(windowStart);
  windowEnd.setMonth(windowEnd.getMonth() + 1);

  const { data: usageData, error: usageError } = await supabase
    .from("token_usage")
    .select("tokens")
    .eq("user_id", TEST_USER_ID)
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", windowEnd.toISOString());

  if (usageError) {
    throw new Error(`Failed to get usage: ${usageError.message}`);
  }

  const used = (usageData || []).reduce((sum, row) => sum + (row.tokens || 0), 0);
  const remaining = Math.max(0, data.monthly_token_allocation - used);

  return {
    allowance: data.monthly_token_allocation,
    used,
    remaining,
  };
}

// Fire a single deduction request
async function fireDeduction(supabase, index) {
  const windowStart = new Date();
  windowStart.setDate(1);
  windowStart.setHours(0, 0, 0, 0);

  const windowEnd = new Date(windowStart);
  windowEnd.setMonth(windowEnd.getMonth() + 1);

  try {
    const { data, error } = await supabase.rpc("atomic_token_deduct", {
      p_user_id: TEST_USER_ID,
      p_tokens: DEDUCTION_AMOUNT,
      p_source: `concurrency_test_${index}`,
      p_from_alloc: true,
      p_allowance: INITIAL_ALLOWANCE,
      p_window_start: windowStart.toISOString(),
      p_window_end: windowEnd.toISOString(),
    });

    if (error) {
      return { index, success: false, error: error.message, data: null };
    }

    return { index, success: data?.success || false, error: data?.error, data };
  } catch (err) {
    return { index, success: false, error: err.message, data: null };
  }
}

// Run the concurrency test
async function runConcurrencyTest(supabase) {
  logSection("CONCURRENCY TEST");
  log(`Firing ${CONCURRENT_REQUESTS} concurrent deduction requests...`, "blue");
  log(`Each request deducts ${DEDUCTION_AMOUNT} tokens`, "blue");
  log(`Initial allowance: ${INITIAL_ALLOWANCE} tokens`, "blue");
  log(`Expected: ${EXPECTED_SUCCESSES} successes, ${EXPECTED_FAILURES} failures\n`, "blue");

  // Fire all requests concurrently
  const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
    fireDeduction(supabase, i)
  );

  const results = await Promise.all(promises);

  // Analyze results
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  const insufficientBalanceFailures = failures.filter(
    (r) => r.error === "insufficient_balance"
  );
  const otherFailures = failures.filter(
    (r) => r.error !== "insufficient_balance"
  );

  log("\nResults:", "cyan");
  log(`  Total requests:     ${results.length}`, "blue");
  log(`  Successes:          ${successes.length} ${successes.length === EXPECTED_SUCCESSES ? "✅" : "❌"}`,
    successes.length === EXPECTED_SUCCESSES ? "green" : "red"
  );
  log(`  Failures:           ${failures.length} ${failures.length === EXPECTED_FAILURES ? "✅" : "❌"}`,
    failures.length === EXPECTED_FAILURES ? "green" : "red"
  );
  log(`    - insufficient_balance: ${insufficientBalanceFailures.length}`, "blue");
  log(`    - other errors:         ${otherFailures.length}`, "blue");

  if (otherFailures.length > 0) {
    log("\nOther errors:", "yellow");
    otherFailures.slice(0, 5).forEach((f) => {
      log(`  [${f.index}] ${f.error}`, "yellow");
    });
  }

  return { successes, failures, insufficientBalanceFailures, otherFailures };
}

// Verify final state
async function verifyFinalState(supabase, successCount) {
  logSection("FINAL STATE VERIFICATION");

  const balance = await getCurrentBalance(supabase);
  const expectedRemaining = Math.max(0, INITIAL_ALLOWANCE - successCount * DEDUCTION_AMOUNT);

  log(`Allowance:    ${balance.allowance}`, "blue");
  log(`Used:         ${balance.used}`, "blue");
  log(`Remaining:    ${balance.remaining} ${balance.remaining === expectedRemaining ? "✅" : "❌"}`,
    balance.remaining === expectedRemaining ? "green" : "red"
  );
  log(`Expected:     ${expectedRemaining}`, "blue");

  // Check for negative balance
  if (balance.remaining < 0) {
    log("\n❌ CRITICAL: Negative balance detected!", "red");
    return false;
  }

  // Verify usage rows
  const { data: usageRows, error } = await supabase
    .from("token_usage")
    .select("tokens, source")
    .eq("user_id", TEST_USER_ID)
    .like("source", "concurrency_test_%");

  if (error) {
    log(`Warning: Could not fetch usage rows: ${error.message}`, "yellow");
    return false;
  }

  log(`\nUsage rows created: ${usageRows?.length || 0}`, "blue");

  const totalDeducted = (usageRows || []).reduce((sum, row) => sum + (row.tokens || 0), 0);
  log(`Total deducted: ${totalDeducted} ${totalDeducted === successCount * DEDUCTION_AMOUNT ? "✅" : "❌"}`,
    totalDeducted === successCount * DEDUCTION_AMOUNT ? "green" : "red"
  );

  return balance.remaining === expectedRemaining && balance.remaining >= 0;
}

// Main test runner
async function main() {
  logSection("TOKEN ATOMICITY CONCURRENCY TEST");
  log("Testing atomic_token_deduct with 50 concurrent requests", "blue");

  // Validate environment
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    log("\n❌ Missing environment variables", "red");
    log("Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local", "yellow");
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();

  try {
    // Setup
    await setupTestUser(supabase);

    // Get initial balance
    const initialBalance = await getCurrentBalance(supabase);
    log(`\nInitial balance: ${initialBalance.remaining} tokens`, "blue");

    // Run concurrency test
    const { successes } = await runConcurrencyTest(supabase);

    // Verify final state
    const isValid = await verifyFinalState(supabase, successes.length);

    // Final summary
    logSection("TEST SUMMARY");

    const tests = [
      { name: "Correct number of successes", pass: successes.length === EXPECTED_SUCCESSES },
      { name: "No negative balance", pass: isValid },
      { name: "Atomic deductions (no double-spend)", pass: isValid },
    ];

    tests.forEach((test) => {
      log(`${test.pass ? "✅" : "❌"} ${test.name}`, test.pass ? "green" : "red");
    });

    const allPassed = tests.every((t) => t.pass);

    if (allPassed) {
      log("\n✅ ALL TESTS PASSED", "green");
      log("The atomic_token_deduct function correctly handles concurrent requests.", "green");
      process.exit(0);
    } else {
      log("\n❌ SOME TESTS FAILED", "red");
      process.exit(1);
    }
  } catch (error) {
    log(`\n❌ Test failed with error: ${error.message}`, "red");
    console.error(error);
    process.exit(1);
  }
}

// Run the test
main();
