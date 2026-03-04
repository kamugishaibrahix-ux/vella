#!/usr/bin/env node
/**
 * Stripe Webhook Concurrent HTTP Replay Test
 *
 * Simulates 20 concurrent webhook deliveries with the same event_id
to verify:
 * 1. All requests return 200
 * 2. Exactly one token_topups row created
 * 3. Exactly one webhook_events row created
 * 4. No deadlocks occur
 *
 * Prerequisites:
 *   - Server running (npm run dev or production)
 *   - Stripe webhook secret configured
 *   - Supabase migrations applied
 *
 * Run:
 *   cd MOBILE && node scripts/test-stripe-webhook-concurrent-http.mjs
 */

import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

// Load env
const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const STRIPE_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

// Test configuration
const CONCURRENT_REQUESTS = 20;
const TEST_EVENT_ID = `evt_concurrent_test_${Date.now()}`;
const TEST_PAYMENT_INTENT_ID = `pi_concurrent_test_${Date.now()}`;
const TEST_USER_ID = process.env.TEST_USER_ID || "00000000-0000-0000-0000-000000000002";

// Colors
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

/**
 * Generate Stripe webhook signature
 * @param {string} payload - JSON payload
 * @param {string} secret - Webhook secret
 * @returns {string} Stripe signature header
 */
function generateStripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Build a Stripe checkout.session.completed event payload
 */
function buildCheckoutPayload(eventId, paymentIntentId) {
  const payload = {
    id: eventId,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_${Date.now()}`,
        object: "checkout.session",
        amount_total: 499, // $4.99
        currency: "usd",
        customer: `cus_test_${Date.now()}`,
        mode: "payment",
        payment_intent: paymentIntentId,
        metadata: {
          user_id: TEST_USER_ID,
          topup_sku: "topup_50k",
        },
        status: "complete",
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null },
  };
  return JSON.stringify(payload);
}

/**
 * Fire a single webhook request
 */
async function fireWebhookRequest(index) {
  const payload = buildCheckoutPayload(TEST_EVENT_ID, TEST_PAYMENT_INTENT_ID);
  const signature = generateStripeSignature(payload, STRIPE_SECRET);

  const startTime = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": signature,
      },
      body: payload,
    });

    const latency = Date.now() - startTime;
    const body = await response.text();

    return {
      index,
      status: response.status,
      latency,
      body,
      success: response.status === 200,
      error: response.status !== 200 ? body : null,
    };
  } catch (error) {
    return {
      index,
      status: 0,
      latency: Date.now() - startTime,
      body: null,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Fire concurrent requests
 */
async function fireConcurrentRequests(count) {
  logSection(`FIRING ${count} CONCURRENT WEBHOOK REQUESTS`);
  log(`Event ID: ${TEST_EVENT_ID}`, "blue");
  log(`Payment Intent: ${TEST_PAYMENT_INTENT_ID}`, "blue");
  log(`Target URL: ${BASE_URL}/api/stripe/webhook\n`, "blue");

  const promises = Array.from({ length: count }, (_, i) => fireWebhookRequest(i));
  const results = await Promise.all(promises);

  return results;
}

/**
 * Analyze results
 */
function analyzeResults(results) {
  logSection("RESULT ANALYSIS");

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const latencies = results.map((r) => r.latency);

  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

  log(`Total Requests:      ${results.length}`, "blue");
  log(`Successful (200):    ${successful.length} ${successful.length === CONCURRENT_REQUESTS ? "✅" : "❌"}`,
    successful.length === CONCURRENT_REQUESTS ? "green" : "red"
  );
  log(`Failed:              ${failed.length} ${failed.length === 0 ? "✅" : "❌"}`,
    failed.length === 0 ? "green" : "red"
  );
  log(`Min Latency:         ${minLatency}ms`, "blue");
  log(`Max Latency:         ${maxLatency}ms`, "blue");
  log(`Avg Latency:         ${avgLatency}ms`, "blue");

  if (failed.length > 0) {
    log("\nFailed Requests:", "red");
    failed.forEach((f) => {
      log(`  [${f.index}] Status ${f.status}: ${f.error?.substring(0, 100)}`, "red");
    });
  }

  // Check for 5xx errors (potential deadlocks)
  const serverErrors = results.filter((r) => r.status >= 500);
  if (serverErrors.length > 0) {
    log(`\n⚠️  WARNING: ${serverErrors.length} requests returned 5xx errors`, "yellow");
    log(`   Potential deadlock or server error detected`, "yellow");
  }

  return {
    allReturned200: successful.length === CONCURRENT_REQUESTS,
    noDeadlocks: serverErrors.length === 0,
    latencies,
  };
}

/**
 * Query database state via Supabase
 */
async function queryDatabaseState() {
  // Dynamic import to avoid requiring Supabase for HTTP-only test
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    logSection("DATABASE STATE VERIFICATION");

    // Count webhook_events rows
    const { data: eventRows, error: eventError } = await supabase
      .from("webhook_events")
      .select("id, event_id, event_type, processed_at")
      .eq("event_id", TEST_EVENT_ID);

    if (eventError) {
      log(`Error querying webhook_events: ${eventError.message}`, "red");
    }

    const eventCount = eventRows?.length || 0;
    log(`webhook_events rows:  ${eventCount} ${eventCount === 1 ? "✅" : "❌"}`,
      eventCount === 1 ? "green" : "red"
    );

    // Count token_topups rows
    const { data: topupRows, error: topupError } = await supabase
      .from("token_topups")
      .select("id, user_id, stripe_payment_intent_id, tokens, amount")
      .eq("stripe_payment_intent_id", TEST_PAYMENT_INTENT_ID);

    if (topupError) {
      log(`Error querying token_topups: ${topupError.message}`, "red");
    }

    const topupCount = topupRows?.length || 0;
    const tokensCredited = topupRows?.[0]?.tokens || 0;
    log(`token_topups rows:    ${topupCount} ${topupCount === 1 ? "✅" : "❌"}`,
      topupCount === 1 ? "green" : "red"
    );
    log(`tokens credited:      ${tokensCredited}`, "blue");

    // Check for duplicates across different event_ids for same payment intent
    const { data: duplicateCheck, error: dupError } = await supabase
      .from("token_topups")
      .select("id, stripe_payment_intent_id")
      .eq("stripe_payment_intent_id", TEST_PAYMENT_INTENT_ID);

    const duplicateTopups = (duplicateCheck?.length || 0) - 1;
    const duplicateWebhooks = (eventCount || 0) - 1;

    return {
      eventCount,
      topupCount,
      tokensCredited,
      duplicateTopups: Math.max(0, duplicateTopups),
      duplicateWebhooks: Math.max(0, duplicateWebhooks),
      allCorrect: eventCount === 1 && topupCount === 1,
    };
  } catch (error) {
    log(`\n⚠️  Could not query database state: ${error.message}`, "yellow");
    log("   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to verify DB state", "yellow");
    return {
      eventCount: null,
      topupCount: null,
      tokensCredited: null,
      duplicateTopups: null,
      duplicateWebhooks: null,
      allCorrect: null,
    };
  }
}

/**
 * Cleanup test data
 */
async function cleanupTestData() {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    log("\nCleaning up test data...", "blue");

    // Delete test webhook events
    await supabase.from("webhook_events").delete().eq("event_id", TEST_EVENT_ID);

    // Delete test token topups
    await supabase.from("token_topups").delete().eq("stripe_payment_intent_id", TEST_PAYMENT_INTENT_ID);

    log("Cleanup complete", "green");
  } catch (error) {
    log(`Cleanup skipped: ${error.message}`, "yellow");
  }
}

/**
 * Main test runner
 */
async function main() {
  logSection("STRIPE WEBHOOK CONCURRENT REPLAY TEST");
  log(`Testing ${CONCURRENT_REQUESTS} concurrent requests with same event_id`, "blue");

  // Validate environment
  if (!STRIPE_SECRET) {
    log("\n❌ STRIPE_WEBHOOK_SECRET not set", "red");
    log("Set it in .env.local or environment", "yellow");
    process.exit(1);
  }

  // Pre-cleanup
  await cleanupTestData();

  // Fire concurrent requests
  const results = await fireConcurrentRequests(CONCURRENT_REQUESTS);

  // Analyze HTTP responses
  const httpAnalysis = analyzeResults(results);

  // Wait a moment for DB to settle
  log("\nWaiting 2 seconds for database state to settle...", "blue");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Query database state
  const dbState = await queryDatabaseState();

  // Final summary
  logSection("FINAL SUMMARY");

  const checks = [
    { name: "All 20 requests returned 200", pass: httpAnalysis.allReturned200 },
    { name: "No server errors (5xx) / deadlocks", pass: httpAnalysis.noDeadlocks },
    { name: "Exactly 1 webhook_events row", pass: dbState.eventCount === 1 },
    { name: "Exactly 1 token_topups row", pass: dbState.topupCount === 1 },
    { name: "No duplicate token_topups", pass: dbState.duplicateTopups === 0 },
    { name: "No duplicate webhook_events", pass: dbState.duplicateWebhooks === 0 },
  ];

  checks.forEach((check) => {
    if (check.pass === null) {
      log(`⚠️  ${check.name} (DB verification skipped)`, "yellow");
    } else {
      log(`${check.pass ? "✅" : "❌"} ${check.name}`, check.pass ? "green" : "red");
    }
  });

  // Output for SYSTEM TASK
  logSection("SYSTEM TASK OUTPUT");
  log(`duplicate_topups:       ${dbState.duplicateTopups ?? "N/A (DB unavailable)"}`, "cyan");
  log(`duplicate_webhook_rows: ${dbState.duplicateWebhooks ?? "N/A (DB unavailable)"}`, "cyan");

  const allPassed = checks.every((c) => c.pass === null || c.pass === true);

  if (allPassed) {
    log("\n✅ ALL CHECKS PASSED", "green");
    log("Idempotency verified: concurrent replay safe", "green");
  } else {
    log("\n❌ SOME CHECKS FAILED", "red");
    log("Review output above for details", "red");
  }

  // Cleanup
  await cleanupTestData();

  process.exit(allPassed ? 0 : 1);
}

// Run
main().catch((error) => {
  log(`\n❌ Test failed: ${error.message}`, "red");
  console.error(error);
  process.exit(1);
});
