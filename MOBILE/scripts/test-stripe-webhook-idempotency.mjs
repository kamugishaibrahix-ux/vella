#!/usr/bin/env node
/**
 * Stripe Webhook Idempotency Concurrency Test
 *
 * Tests that the atomic_stripe_webhook_process function correctly handles:
 * 1. Concurrent webhook deliveries (10 simultaneous requests)
 * 2. Replay scenarios (same event delivered multiple times)
 * 3. Exactly-once token credit per payment intent
 *
 * Prerequisites:
 *   - Supabase dev environment running
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - Migration 20260244_stripe_webhook_idempotency_hardening.sql applied
 *
 * Test scenario:
 *   - Setup: Create test user with subscription
 *   - Test 1: Fire 10 concurrent RPC calls for same event + payment intent
 *   - Verify: Exactly 1 token_topup row, exactly 1 webhook_events row
 *   - Test 2: Replay same event (simulating Stripe retry)
 *   - Verify: No additional rows, returns already_processed=true
 *
 * Run:
 *   cd MOBILE && node scripts/test-stripe-webhook-idempotency.mjs
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

// Test configuration
const TEST_USER_ID = process.env.TEST_USER_ID || "00000000-0000-0000-0000-000000000002";
const TEST_EVENT_ID = "evt_test_idempotency_001";
const TEST_PAYMENT_INTENT_ID = "pi_test_idempotency_001";
const TEST_TOKENS = 50000;
const CONCURRENT_REQUESTS = 10;

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

// Setup test user with subscription
async function setupTestUser(supabase) {
  log("Setting up test user...", "blue");

  // Ensure profile exists
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: TEST_USER_ID, display_name: "Test User (Stripe Webhook)" }, { onConflict: "id" });

  if (profileError) {
    throw new Error(`Failed to ensure profile: ${profileError.message}`);
  }

  // Ensure subscription exists
  const { error: subError } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: TEST_USER_ID,
        plan: "pro",
        status: "active",
        monthly_token_allocation: 100000,
        monthly_token_allocation_used: 0,
        token_balance: 0,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (subError) {
    throw new Error(`Failed to ensure subscription: ${subError.message}`);
  }

  log(`Test user ${TEST_USER_ID} ready`, "green");
}

// Cleanup previous test data
async function cleanupTestData(supabase) {
  log("Cleaning up previous test data...", "blue");

  // Delete test webhook events
  const { error: eventError } = await supabase
    .from("webhook_events")
    .delete()
    .eq("event_id", TEST_EVENT_ID);

  if (eventError) {
    log(`Warning: Could not delete test webhook events: ${eventError.message}`, "yellow");
  }

  // Delete test token topups
  const { error: topupError } = await supabase
    .from("token_topups")
    .delete()
    .eq("stripe_payment_intent_id", TEST_PAYMENT_INTENT_ID);

  if (topupError) {
    log(`Warning: Could not delete test token topups: ${topupError.message}`, "yellow");
  }

  // Reset token balance
  const { error: balanceError } = await supabase
    .from("subscriptions")
    .update({ token_balance: 0 })
    .eq("user_id", TEST_USER_ID);

  if (balanceError) {
    log(`Warning: Could not reset token balance: ${balanceError.message}`, "yellow");
  }

  log("Cleanup complete", "green");
}

// Fire a single atomic webhook process call
async function fireAtomicProcess(supabase, index) {
  try {
    const { data, error } = await supabase.rpc("atomic_stripe_webhook_process", {
      p_event_id: TEST_EVENT_ID,
      p_event_type: "checkout.session.completed",
      p_payment_intent_id: TEST_PAYMENT_INTENT_ID,
      p_user_id: TEST_USER_ID,
      p_tokens_to_award: TEST_TOKENS,
      p_amount_usd: 4.99,
      p_pack_name: "topup_50k",
    });

    if (error) {
      return { index, success: false, error: error.message, data: null };
    }

    return { 
      index, 
      success: data?.success || false, 
      already_processed: data?.already_processed || false,
      error: data?.error, 
      data 
    };
  } catch (err) {
    return { index, success: false, error: err.message, data: null };
  }
}

// Test 1: Concurrent requests
async function testConcurrentRequests(supabase) {
  logSection("TEST 1: CONCURRENT REQUESTS (10 simultaneous)");
  log(`Event ID: ${TEST_EVENT_ID}`, "blue");
  log(`Payment Intent ID: ${TEST_PAYMENT_INTENT_ID}`, "blue");
  log(`Expected: Exactly 1 success with credit, 9 return already_processed=true\n`, "blue");

  // Fire all requests concurrently
  const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
    fireAtomicProcess(supabase, i)
  );

  const results = await Promise.all(promises);

  // Analyze results
  const successes = results.filter((r) => r.success && !r.already_processed);
  const alreadyProcessed = results.filter((r) => r.success && r.already_processed);
  const failures = results.filter((r) => !r.success);

  log("Results:", "cyan");
  log(`  Total requests:      ${results.length}`, "blue");
  log(`  New credits:         ${successes.length} ${successes.length === 1 ? "✅" : "❌"}`,
    successes.length === 1 ? "green" : "red"
  );
  log(`  Already processed:   ${alreadyProcessed.length} ${alreadyProcessed.length === 9 ? "✅" : "❌"}`,
    alreadyProcessed.length === 9 ? "green" : "red"
  );
  log(`  Failures:            ${failures.length} ${failures.length === 0 ? "✅" : "❌"}`,
    failures.length === 0 ? "green" : "red"
  );

  if (failures.length > 0) {
    log("\nFailures:", "red");
    failures.forEach((f) => {
      log(`  [${f.index}] ${f.error}`, "red");
    });
  }

  return { successes, alreadyProcessed, failures };
}

// Verify database state
async function verifyDatabaseState(supabase) {
  logSection("DATABASE STATE VERIFICATION");

  // Count webhook_events rows
  const { data: eventRows, error: eventError } = await supabase
    .from("webhook_events")
    .select("event_id, event_type, processed_at")
    .eq("event_id", TEST_EVENT_ID);

  if (eventError) {
    throw new Error(`Failed to query webhook_events: ${eventError.message}`);
  }

  const eventCount = eventRows?.length || 0;
  log(`Webhook events rows: ${eventCount} ${eventCount === 1 ? "✅" : "❌"}`,
    eventCount === 1 ? "green" : "red"
  );

  // Count token_topups rows
  const { data: topupRows, error: topupError } = await supabase
    .from("token_topups")
    .select("user_id, stripe_payment_intent_id, tokens_awarded, amount_usd")
    .eq("stripe_payment_intent_id", TEST_PAYMENT_INTENT_ID);

  if (topupError) {
    throw new Error(`Failed to query token_topups: ${topupError.message}`);
  }

  const topupCount = topupRows?.length || 0;
  const topupTokens = topupRows?.[0]?.tokens_awarded || 0;
  log(`Token topups rows:   ${topupCount} ${topupCount === 1 ? "✅" : "❌"}`,
    topupCount === 1 ? "green" : "red"
  );
  log(`Tokens awarded:      ${topupTokens} ${topupTokens === TEST_TOKENS ? "✅" : "❌"}`,
    topupTokens === TEST_TOKENS ? "green" : "red"
  );

  // Check subscription token_balance
  const { data: subRow, error: subError } = await supabase
    .from("subscriptions")
    .select("token_balance")
    .eq("user_id", TEST_USER_ID)
    .single();

  if (subError) {
    throw new Error(`Failed to query subscription: ${subError.message}`);
  }

  const tokenBalance = subRow?.token_balance || 0;
  log(`Token balance:       ${tokenBalance} ${tokenBalance === TEST_TOKENS ? "✅" : "❌"}`,
    tokenBalance === TEST_TOKENS ? "green" : "red"
  );

  return {
    eventCount,
    topupCount,
    topupTokens,
    tokenBalance,
    allCorrect: eventCount === 1 && topupCount === 1 && topupTokens === TEST_TOKENS && tokenBalance === TEST_TOKENS,
  };
}

// Test 2: Replay scenario (same event delivered again)
async function testReplay(supabase) {
  logSection("TEST 2: REPLAY SCENARIO (same event delivered again)");
  log("Simulating Stripe retry delivering same event...", "blue");

  const result = await fireAtomicProcess(supabase, 99);

  log("\nReplay result:", "cyan");
  log(`  Success:            ${result.success} ✅`, result.success ? "green" : "red");
  log(`  Already processed:  ${result.already_processed} ✅`, result.already_processed ? "green" : "red");
  
  if (result.error) {
    log(`  Error:              ${result.error}`, "red");
  }

  // Verify database state unchanged
  const state = await verifyDatabaseState(supabase);
  
  const replayCorrect = result.success && result.already_processed && state.allCorrect;
  log(`\nReplay handled correctly: ${replayCorrect ? "✅ PASS" : "❌ FAIL"}`, 
    replayCorrect ? "green" : "red"
  );

  return replayCorrect;
}

// Test 3: Different event, same payment intent (edge case)
async function testDifferentEventSamePayment(supabase) {
  logSection("TEST 3: DIFFERENT EVENT, SAME PAYMENT INTENT (edge case)");
  
  const differentEventId = "evt_test_idempotency_002";
  log(`Event ID: ${differentEventId}`, "blue");
  log(`Payment Intent ID: ${TEST_PAYMENT_INTENT_ID} (same as Test 1)`, "blue");
  log("Expected: already_processed=true (payment already credited)\n", "blue");

  try {
    const { data, error } = await supabase.rpc("atomic_stripe_webhook_process", {
      p_event_id: differentEventId,
      p_event_type: "payment_intent.succeeded",
      p_payment_intent_id: TEST_PAYMENT_INTENT_ID,
      p_user_id: TEST_USER_ID,
      p_tokens_to_award: TEST_TOKENS,
      p_amount_usd: 4.99,
      p_pack_name: "topup_50k",
    });

    if (error) {
      log(`Error: ${error.message}`, "red");
      return false;
    }

    log("Result:", "cyan");
    log(`  Success:            ${data.success} ✅`, data.success ? "green" : "red");
    log(`  Already processed:  ${data.already_processed} ✅`, data.already_processed ? "green" : "red");
    log(`  Details:            ${data.details || "N/A"}`, "blue");

    const correct = data.success && data.already_processed && data.details === "payment_already_credited";
    
    // Verify no additional rows created
    const state = await verifyDatabaseState(supabase);
    
    const pass = correct && state.allCorrect;
    log(`\nEdge case handled correctly: ${pass ? "✅ PASS" : "❌ FAIL"}`, 
      pass ? "green" : "red"
    );
    
    return pass;
  } catch (err) {
    log(`Exception: ${err.message}`, "red");
    return false;
  }
}

// Main test runner
async function main() {
  logSection("STRIPE WEBHOOK IDEMPOTENCY TEST");
  log("Testing atomic_stripe_webhook_process with concurrent requests and replay", "blue");

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
    await cleanupTestData(supabase);

    // Test 1: Concurrent requests
    const { successes, alreadyProcessed, failures } = await testConcurrentRequests(supabase);
    
    // Verify state after Test 1
    const state1 = await verifyDatabaseState(supabase);
    
    // Test 2: Replay
    const replayPass = await testReplay(supabase);
    
    // Test 3: Different event, same payment
    const edgeCasePass = await testDifferentEventSamePayment(supabase);

    // Final summary
    logSection("TEST SUMMARY");

    const tests = [
      { 
        name: "Exactly 1 credit from 10 concurrent requests", 
        pass: successes.length === 1 && alreadyProcessed.length === 9 && failures.length === 0 
      },
      { name: "Exactly 1 webhook_events row", pass: state1.eventCount === 1 },
      { name: "Exactly 1 token_topups row", pass: state1.topupCount === 1 },
      { name: "Correct token amount credited", pass: state1.topupTokens === TEST_TOKENS },
      { name: "Subscription balance updated", pass: state1.tokenBalance === TEST_TOKENS },
      { name: "Replay returns already_processed", pass: replayPass },
      { name: "Different event, same payment returns already_processed", pass: edgeCasePass },
    ];

    tests.forEach((test) => {
      log(`${test.pass ? "✅" : "❌"} ${test.name}`, test.pass ? "green" : "red");
    });

    const allPassed = tests.every((t) => t.pass);

    if (allPassed) {
      log("\n✅ ALL TESTS PASSED", "green");
      log("The atomic_stripe_webhook_process function guarantees exactly-once semantics:", "green");
      log("  - Events are processed at most once", "blue");
      log("  - Tokens are credited at most once per payment intent", "blue");
      log("  - Concurrent requests are serialized via advisory locks", "blue");
      log("  - Replays return success without double-credit", "blue");
      
      // Cleanup
      await cleanupTestData(supabase);
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
