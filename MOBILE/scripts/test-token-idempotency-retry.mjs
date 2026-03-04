/**
 * Token Idempotency Retry Test
 *
 * Simulates network retry scenarios to verify DB-level idempotency:
 * 1. Double charge with same request_id → second returns already_charged
 * 2. Double refund with same request_id → second returns refund_already_processed
 *
 * Usage: node MOBILE/scripts/test-token-idempotency-retry.mjs
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL env vars
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Test configuration
const TEST_USER_ID = process.env.TEST_USER_ID || "00000000-0000-0000-0000-000000000000";
const TEST_TOKENS = 100;
const TEST_SOURCE = "test:idempotency:retry";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ ASSERT FAILED: ${message}`);
    testsFailed++;
    return false;
  }
  console.log(`  ✅ ${message}`);
  testsPassed++;
  return true;
}

async function cleanupTestData(requestId) {
  // Delete test rows created during test
  await supabase
    .from("token_usage")
    .delete()
    .eq("user_id", TEST_USER_ID)
    .eq("request_id", requestId);
}

async function getUsageRows(requestId) {
  const { data, error } = await supabase
    .from("token_usage")
    .select("kind, tokens, request_id")
    .eq("user_id", TEST_USER_ID)
    .eq("request_id", requestId);

  if (error) {
    console.error("Query error:", error);
    return [];
  }
  return data || [];
}

async function runTests() {
  console.log("\n========================================");
  console.log("TOKEN IDEMPOTENCY RETRY TEST SUITE");
  console.log("========================================\n");

  // ============================================================
  // TEST 1: Double Charge Simulation (Network Retry)
  // ============================================================
  console.log("TEST 1: Double Charge with Same request_id");
  console.log("------------------------------------------");

  const chargeRequestId = randomUUID();

  try {
    // First charge call
    const firstCall = await supabase.rpc("atomic_token_deduct", {
      p_user_id: TEST_USER_ID,
      p_request_id: chargeRequestId,
      p_tokens: TEST_TOKENS,
      p_source: TEST_SOURCE,
      p_from_alloc: false,
      p_allowance: 10000,
      p_window_start: new Date(Date.now() - 86400000).toISOString(),
      p_window_end: new Date(Date.now() + 86400000).toISOString(),
    });

    const firstResult = firstCall.data;

    assert(firstResult?.success === true, "First charge should succeed");
    assert(!firstResult?.warning, "First charge should have no warning");
    assert(firstResult?.error === null, "First charge should have no error");

    // Simulate network retry: second call with same request_id
    const secondCall = await supabase.rpc("atomic_token_deduct", {
      p_user_id: TEST_USER_ID,
      p_request_id: chargeRequestId,
      p_tokens: TEST_TOKENS,
      p_source: TEST_SOURCE,
      p_from_alloc: false,
      p_allowance: 10000,
      p_window_start: new Date(Date.now() - 86400000).toISOString(),
      p_window_end: new Date(Date.now() + 86400000).toISOString(),
    });

    const secondResult = secondCall.data;

    assert(secondResult?.success === true, "Second charge should return success (idempotent)");
    assert(secondResult?.warning === "already_charged", "Second charge should return already_charged warning");

    // Verify only ONE charge row exists
    const chargeRows = await getUsageRows(chargeRequestId);
    const chargeCount = chargeRows.filter((r) => r.kind === "charge").length;

    assert(chargeCount === 1, `Should have exactly 1 charge row, found ${chargeCount}`);

    console.log("  📊 Charge rows for request_id:", chargeRows);

  } catch (err) {
    console.error("Test 1 error:", err);
    testsFailed++;
  } finally {
    await cleanupTestData(chargeRequestId);
  }

  console.log("");

  // ============================================================
  // TEST 2: Double Refund Simulation (Network Retry)
  // ============================================================
  console.log("TEST 2: Double Refund with Same request_id");
  console.log("------------------------------------------");

  const refundRequestId = randomUUID();

  try {
    // First, create a charge to refund
    const chargeResult = await supabase.rpc("atomic_token_deduct", {
      p_user_id: TEST_USER_ID,
      p_request_id: refundRequestId,
      p_tokens: TEST_TOKENS,
      p_source: TEST_SOURCE,
      p_from_alloc: false,
      p_allowance: 10000,
      p_window_start: new Date(Date.now() - 86400000).toISOString(),
      p_window_end: new Date(Date.now() + 86400000).toISOString(),
    });

    assert(chargeResult.data?.success === true, "Setup charge should succeed");

    // First refund call
    const firstRefund = await supabase.rpc("atomic_token_refund", {
      p_user_id: TEST_USER_ID,
      p_request_id: refundRequestId,
      p_tokens: TEST_TOKENS,
      p_source: `${TEST_SOURCE}:refund`,
    });

    const firstRefundResult = firstRefund.data;

    assert(firstRefundResult?.success === true, "First refund should succeed");
    assert(firstRefundResult?.refunded_amount === TEST_TOKENS, `First refund should refund ${TEST_TOKENS} tokens`);
    assert(!firstRefundResult?.warning, "First refund should have no warning");

    // Simulate network retry: second refund call with same request_id
    const secondRefund = await supabase.rpc("atomic_token_refund", {
      p_user_id: TEST_USER_ID,
      p_request_id: refundRequestId,
      p_tokens: TEST_TOKENS,
      p_source: `${TEST_SOURCE}:refund`,
    });

    const secondRefundResult = secondRefund.data;

    assert(secondRefundResult?.success === true, "Second refund should return success (idempotent)");
    assert(secondRefundResult?.warning === "refund_already_processed", "Second refund should return refund_already_processed warning");
    assert(secondRefundResult?.refunded_amount === 0, "Second refund should refund 0 tokens");

    // Verify exactly ONE charge and ONE refund row exist
    const refundRows = await getUsageRows(refundRequestId);
    const chargeCount = refundRows.filter((r) => r.kind === "charge").length;
    const refundCount = refundRows.filter((r) => r.kind === "refund").length;

    assert(chargeCount === 1, `Should have exactly 1 charge row, found ${chargeCount}`);
    assert(refundCount === 1, `Should have exactly 1 refund row, found ${refundCount}`);

    // Verify token amounts
    const chargeRow = refundRows.find((r) => r.kind === "charge");
    const refundRow = refundRows.find((r) => r.kind === "refund");

    assert(chargeRow?.tokens === TEST_TOKENS, `Charge should be +${TEST_TOKENS}`);
    assert(refundRow?.tokens === -TEST_TOKENS, `Refund should be -${TEST_TOKENS}`);

    console.log("  📊 Rows for request_id:", refundRows);

  } catch (err) {
    console.error("Test 2 error:", err);
    testsFailed++;
  } finally {
    await cleanupTestData(refundRequestId);
  }

  console.log("");

  // ============================================================
  // TEST 3: Refund Without Charge Should Fail
  // ============================================================
  console.log("TEST 3: Refund Without Matching Charge Should Fail");
  console.log("---------------------------------------------------");

  const orphanRequestId = randomUUID();

  try {
    // Attempt refund without prior charge
    const orphanRefund = await supabase.rpc("atomic_token_refund", {
      p_user_id: TEST_USER_ID,
      p_request_id: orphanRequestId,
      p_tokens: TEST_TOKENS,
      p_source: `${TEST_SOURCE}:orphan`,
    });

    const orphanResult = orphanRefund.data;

    assert(orphanResult?.success === false, "Refund without charge should fail");
    assert(orphanResult?.error === "original_charge_not_found", "Should return original_charge_not_found error");

    // Verify no rows created
    const orphanRows = await getUsageRows(orphanRequestId);
    assert(orphanRows.length === 0, "Should have 0 rows for orphan request_id");

  } catch (err) {
    console.error("Test 3 error:", err);
    testsFailed++;
  } finally {
    await cleanupTestData(orphanRequestId);
  }

  console.log("");

  // ============================================================
  // TEST 4: Refund Exceeding Charge Should Fail
  // ============================================================
  console.log("TEST 4: Refund Exceeding Charge Amount Should Fail");
  console.log("---------------------------------------------------");

  const excessRequestId = randomUUID();

  try {
    // Create charge for 100 tokens
    const chargeResult = await supabase.rpc("atomic_token_deduct", {
      p_user_id: TEST_USER_ID,
      p_request_id: excessRequestId,
      p_tokens: 100,
      p_source: TEST_SOURCE,
      p_from_alloc: false,
      p_allowance: 10000,
      p_window_start: new Date(Date.now() - 86400000).toISOString(),
      p_window_end: new Date(Date.now() + 86400000).toISOString(),
    });

    assert(chargeResult.data?.success === true, "Setup charge should succeed");

    // Attempt refund for MORE than charged
    const excessRefund = await supabase.rpc("atomic_token_refund", {
      p_user_id: TEST_USER_ID,
      p_request_id: excessRequestId,
      p_tokens: 200, // More than the 100 charged
      p_source: `${TEST_SOURCE}:excess`,
    });

    const excessResult = excessRefund.data;

    assert(excessResult?.success === false, "Refund exceeding charge should fail");
    assert(excessResult?.error === "refund_exceeds_charge", "Should return refund_exceeds_charge error");

    // Verify no refund row was created
    const excessRows = await getUsageRows(excessRequestId);
    const refundCount = excessRows.filter((r) => r.kind === "refund").length;
    assert(refundCount === 0, "Should have 0 refund rows when refund fails");

  } catch (err) {
    console.error("Test 4 error:", err);
    testsFailed++;
  } finally {
    await cleanupTestData(excessRequestId);
  }

  console.log("");

  // ============================================================
  // Summary
  // ============================================================
  console.log("========================================");
  console.log("TEST SUMMARY");
  console.log("========================================");
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log("");

  if (testsFailed > 0) {
    console.log("❌ TEST SUITE FAILED");
    process.exit(1);
  } else {
    console.log("✅ ALL TESTS PASSED");
    console.log("");
    console.log("Network retry safety verified:");
    console.log("  - Duplicate charges return already_charged without double-billing");
    console.log("  - Duplicate refunds return refund_already_processed without double-credit");
    console.log("  - DB UNIQUE constraint enforces exactly-once semantics");
    process.exit(0);
  }
}

runTests();
