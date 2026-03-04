/**
 * Ledger Write Firewall Test Harness
 *
 * Verifies that:
 * 1. Direct writes to token_usage/topups are blocked (RLS + REVOKE)
 * 2. SECURITY DEFINER RPC functions still work
 * 3. Overdraft attempts are rejected without inserting rows
 *
 * Usage: node MOBILE/scripts/test-ledger-write-firewall.mjs
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

// Use service role client for setup/teardown, but tests will attempt writes
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_USER_ID = process.env.TEST_USER_ID || randomUUID();
const TEST_ALLOWANCE = 500;

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

  if (error) return [];
  return data || [];
}

async function runTests() {
  console.log("\n========================================");
  console.log("LEDGER WRITE FIREWALL TEST HARNESS");
  console.log("========================================\n");

  // ============================================================
  // TEST 1: Direct INSERT should fail
  // ============================================================
  console.log("TEST 1: Direct INSERT into token_usage blocked");
  console.log("----------------------------------------------");

  const testRequestId = randomUUID();
  let insertBlocked = false;
  let insertError = null;

  try {
    const { error } = await supabase
      .from("token_usage")
      .insert({
        user_id: TEST_USER_ID,
        request_id: testRequestId,
        kind: "charge",
        source: "firewall:test:direct-insert",
        tokens: 100,
        from_allocation: false,
      })
      .select();

    if (error) {
      insertBlocked = true;
      insertError = error;
    }
  } catch (err) {
    insertBlocked = true;
    insertError = err;
  }

  assert(insertBlocked, "Direct INSERT was blocked (as expected)");

  if (insertError) {
    const isPermissionError =
      insertError.code === "42501" || // permission denied
      insertError.message?.toLowerCase().includes("permission") ||
      insertError.message?.toLowerCase().includes("new row violates");
    assert(isPermissionError, `Error indicates permission/RLS violation: ${insertError.message || insertError.code}`);
  }

  // Verify no row was created
  const rowsAfterInsert = await getUsageRows(testRequestId);
  assert(rowsAfterInsert.length === 0, "No rows created after blocked INSERT");

  console.log("");

  // ============================================================
  // TEST 2: Direct UPDATE should fail
  // ============================================================
  console.log("TEST 2: Direct UPDATE on token_usage blocked");
  console.log("----------------------------------------------");

  let updateBlocked = false;

  try {
    const { error } = await supabase
      .from("token_usage")
      .update({ tokens: 999 })
      .eq("user_id", TEST_USER_ID);

    if (error) {
      updateBlocked = true;
    }
  } catch (err) {
    updateBlocked = true;
  }

  assert(updateBlocked, "Direct UPDATE was blocked (as expected)");
  console.log("");

  // ============================================================
  // TEST 3: Direct DELETE should fail
  // ============================================================
  console.log("TEST 3: Direct DELETE on token_usage blocked");
  console.log("----------------------------------------------");

  let deleteBlocked = false;

  try {
    const { error } = await supabase
      .from("token_usage")
      .delete()
      .eq("user_id", TEST_USER_ID);

    if (error) {
      deleteBlocked = true;
    }
  } catch (err) {
    deleteBlocked = true;
  }

  assert(deleteBlocked, "Direct DELETE was blocked (as expected)");
  console.log("");

  // ============================================================
  // TEST 4: Direct INSERT into token_topups should fail
  // ============================================================
  console.log("TEST 4: Direct INSERT into token_topups blocked");
  console.log("-----------------------------------------------");

  let topupInsertBlocked = false;

  try {
    const { error } = await supabase
      .from("token_topups")
      .insert({
        user_id: TEST_USER_ID,
        pack_name: "test_pack",
        tokens_awarded: 1000,
        amount_usd: 9.99,
        status: "completed",
      });

    if (error) {
      topupInsertBlocked = true;
    }
  } catch (err) {
    topupInsertBlocked = true;
  }

  assert(topupInsertBlocked, "Direct INSERT into token_topups was blocked");
  console.log("");

  // ============================================================
  // TEST 5: SECURITY DEFINER RPC should succeed (charge)
  // ============================================================
  console.log("TEST 5: atomic_token_deduct RPC succeeds");
  console.log("------------------------------------------");

  const rpcRequestId = randomUUID();

  try {
    const { data, error } = await supabase.rpc("atomic_token_deduct", {
      p_user_id: TEST_USER_ID,
      p_request_id: rpcRequestId,
      p_tokens: 100,
      p_source: "firewall:test:rpc-charge",
      p_from_alloc: false,
      p_allowance: TEST_ALLOWANCE,
      p_window_start: new Date(Date.now() - 86400000).toISOString(),
      p_window_end: new Date(Date.now() + 86400000).toISOString(),
    });

    if (error) {
      console.error("  RPC error:", error);
      assert(false, `RPC call failed: ${error.message}`);
    } else {
      assert(data?.success === true, "RPC charge succeeded");
      assert(data?.error === null, "RPC returned no error");
    }

    // Verify row was created
    const rpcRows = await getUsageRows(rpcRequestId);
    assert(rpcRows.length === 1, "Exactly 1 row created by RPC");
    assert(rpcRows[0]?.kind === "charge", "Row has kind='charge'");
    assert(rpcRows[0]?.tokens === 100, "Row has correct token amount");

  } catch (err) {
    console.error("  Test error:", err);
    assert(false, `Test threw exception: ${err.message}`);
  } finally {
    await cleanupTestData(rpcRequestId);
  }

  console.log("");

  // ============================================================
  // TEST 6: Overdraft attempt rejected without row insert
  // ============================================================
  console.log("TEST 6: Overdraft attempt blocked (insufficient_balance)");
  console.log("--------------------------------------------------------");

  const overdraftRequestId = randomUUID();

  try {
    // Attempt to charge more than allowance
    const { data, error } = await supabase.rpc("atomic_token_deduct", {
      p_user_id: TEST_USER_ID,
      p_request_id: overdraftRequestId,
      p_tokens: TEST_ALLOWANCE + 1000, // More than available
      p_source: "firewall:test:overdraft",
      p_from_alloc: false,
      p_allowance: TEST_ALLOWANCE,
      p_window_start: new Date(Date.now() - 86400000).toISOString(),
      p_window_end: new Date(Date.now() + 86400000).toISOString(),
    });

    if (error) {
      console.error("  RPC error:", error);
      assert(false, `RPC should not error for overdraft, should return success=false`);
    } else {
      assert(data?.success === false, "Overdraft returned success=false");
      assert(data?.error === "insufficient_balance", "Overdraft error is 'insufficient_balance'");
    }

    // Verify NO row was created for failed charge
    const overdraftRows = await getUsageRows(overdraftRequestId);
    assert(overdraftRows.length === 0, "No rows created for failed overdraft");

  } catch (err) {
    console.error("  Test error:", err);
    assert(false, `Test threw exception: ${err.message}`);
  } finally {
    await cleanupTestData(overdraftRequestId);
  }

  console.log("");

  // ============================================================
  // TEST 7: SECURITY DEFINER RPC should succeed (refund)
  // ============================================================
  console.log("TEST 7: atomic_token_refund RPC succeeds");
  console.log("------------------------------------------");

  const refundTestId = randomUUID();

  try {
    // First create a charge to refund
    const chargeResult = await supabase.rpc("atomic_token_deduct", {
      p_user_id: TEST_USER_ID,
      p_request_id: refundTestId,
      p_tokens: 50,
      p_source: "firewall:test:refund-charge",
      p_from_alloc: false,
      p_allowance: TEST_ALLOWANCE,
      p_window_start: new Date(Date.now() - 86400000).toISOString(),
      p_window_end: new Date(Date.now() + 86400000).toISOString(),
    });

    assert(chargeResult.data?.success === true, "Setup charge succeeded");

    // Now refund
    const { data, error } = await supabase.rpc("atomic_token_refund", {
      p_user_id: TEST_USER_ID,
      p_request_id: refundTestId,
      p_tokens: 50,
      p_source: "firewall:test:refund",
    });

    if (error) {
      console.error("  RPC error:", error);
      assert(false, `Refund RPC failed: ${error.message}`);
    } else {
      assert(data?.success === true, "Refund RPC succeeded");
      assert(data?.refunded_amount === 50, "Correct refund amount");
    }

    // Verify refund row exists
    const refundRows = await getUsageRows(refundTestId);
    const chargeCount = refundRows.filter((r) => r.kind === "charge").length;
    const refundCount = refundRows.filter((r) => r.kind === "refund").length;

    assert(chargeCount === 1, "Charge row exists");
    assert(refundCount === 1, "Refund row created");

  } catch (err) {
    console.error("  Test error:", err);
    assert(false, `Test threw exception: ${err.message}`);
  } finally {
    await cleanupTestData(refundTestId);
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
    console.log("Ledger Write Firewall Verified:");
    console.log("  - Direct INSERT/UPDATE/DELETE blocked (RLS + REVOKE)");
    console.log("  - SECURITY DEFINER RPC functions work correctly");
    console.log("  - Overdraft attempts rejected without row insert");
    console.log("  - Balance non-negativity enforced at DB level");
    console.log("");
    console.log("Negative balance is now STRUCTURALLY IMPOSSIBLE:");
    console.log("  - No direct writes bypass atomic functions");
    console.log("  - Atomic functions check balance before insert");
    console.log("  - Even with service_role, direct DML is denied");
    process.exit(0);
  }
}

runTests();
