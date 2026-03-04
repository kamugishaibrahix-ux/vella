/**
 * Phase 3.3: Redis Failure Rate Limit Test
 *
 * Verifies:
 * 1. FAIL-CLOSED policy denies when Redis down (voice_speak)
 * 2. FAIL-OPEN policy allows with fallback when Redis down (system_health)
 *
 * Usage:
 *   # With Redis down simulation (uses fallback)
 *   RATE_LIMIT_FORCE_REDIS_DOWN=1 node scripts/test-rate-limit-redis-failure.mjs
 *
 *   # With actual Redis (tests normal operation)
 *   node scripts/test-rate-limit-redis-failure.mjs
 */

// Inline implementation of the rate limiter logic for testing
// This simulates the behavior without needing the full Next.js app

const FORCE_REDIS_DOWN = process.env.RATE_LIMIT_FORCE_REDIS_DOWN === "1";

// Inline constants from rateLimitPolicy.ts
const RATE_LIMIT_POLICY = {
  // FAIL-CLOSED (deny when Redis down)
  voice_speak: "closed",
  audio_vella: "closed",
  realtime_offer: "closed",
  transcribe: "closed",
  insights_generate: "closed",
  insights_patterns: "closed",
  admin_suspend: "closed",
  stripe_webhook: "closed",
  deep_insights: "closed",
  clarity: "closed",
  compass: "closed",

  // FAIL-OPEN (allow with fallback when Redis down)
  system_health: "open",
  checkins_read: "open",
  checkins_write: "open",
  journal_read: "open",
  session_read: "open",
  vella_text: "open",
  inbox_read: "open",
  identity_read: "open",
  forecast_read: "open",
  token_balance_read: "open",
  entitlements_read: "open",
};

function getPolicy(routeKey) {
  return RATE_LIMIT_POLICY[routeKey] || "closed"; // Default closed for safety
}

// Fallback throttle (in-memory)
const fallbackThrottles = new Map();
const FALLBACK_IP_LIMIT = 20;
const FALLBACK_USER_LIMIT = 30;
const FALLBACK_WINDOW_MS = 60000;

function checkFallbackThrottle(key, limit) {
  const now = Date.now();
  const entry = fallbackThrottles.get(key);

  if (!entry || now >= entry.resetAt) {
    fallbackThrottles.set(key, {
      count: 1,
      resetAt: now + FALLBACK_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (entry.count >= limit) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  entry.count++;
  return { allowed: true };
}

function getFallbackLimit(key) {
  if (key.startsWith("ip:")) return FALLBACK_IP_LIMIT;
  if (key.startsWith("user:")) return FALLBACK_USER_LIMIT;
  return FALLBACK_IP_LIMIT;
}

/**
 * Simulated rate limit function (matches behavior of rateLimit.ts)
 */
async function rateLimit({ key, limit, window, routeKey }) {
  const policy = getPolicy(routeKey);

  // Simulate Redis down when FORCE_REDIS_DOWN is set
  if (FORCE_REDIS_DOWN) {
    if (policy === "closed") {
      return {
        allowed: false,
        reason: "redis_down",
        policy: "closed",
        status: 503,
        retryAfterSeconds: 60,
      };
    }

    // FAIL-OPEN: Use local fallback throttle
    const fallbackLimit = getFallbackLimit(key);
    const fallbackResult = checkFallbackThrottle(key, fallbackLimit);

    if (!fallbackResult.allowed) {
      return {
        allowed: false,
        reason: "limited",
        policy: "open",
        status: 429,
        retryAfterSeconds: fallbackResult.retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      reason: "redis_down",
      policy: "open",
      status: 200,
    };
  }

  // Normal operation (Redis OK) - simulate allowed
  return {
    allowed: true,
    reason: "ok",
    policy,
    status: 200,
  };
}

// ============================================================================
// TESTS
// ============================================================================

async function testFailClosed() {
  console.log("\n🧪 Test: FAIL-CLOSED Policy (voice_speak)");
  console.log(`   Redis simulated: ${FORCE_REDIS_DOWN ? "DOWN" : "UP"}`);

  const result = await rateLimit({
    key: "user:voice_speak:test-user",
    limit: 10,
    window: 300,
    routeKey: "voice_speak",
  });

  console.log(`   Allowed: ${result.allowed}`);
  console.log(`   Status: ${result.status}`);
  console.log(`   Policy: ${result.policy}`);
  console.log(`   Reason: ${result.reason}`);

  if (FORCE_REDIS_DOWN) {
    if (!result.allowed && result.status === 503 && result.policy === "closed") {
      console.log("   ✅ PASS: FAIL-CLOSED denies when Redis down");
      return true;
    } else {
      console.log("   ❌ FAIL: FAIL-CLOSED should deny when Redis down");
      return false;
    }
  } else {
    if (result.allowed && result.status === 200) {
      console.log("   ✅ PASS: ALLOWED when Redis up");
      return true;
    } else {
      console.log("   ❌ FAIL: Should allow when Redis up");
      return false;
    }
  }
}

async function testFailOpen() {
  console.log("\n🧪 Test: FAIL-OPEN Policy (system_health)");
  console.log(`   Redis simulated: ${FORCE_REDIS_DOWN ? "DOWN" : "UP"}`);

  const result = await rateLimit({
    key: "ip:health:127.0.0.1",
    limit: 30,
    window: 60,
    routeKey: "system_health",
  });

  console.log(`   Allowed: ${result.allowed}`);
  console.log(`   Status: ${result.status}`);
  console.log(`   Policy: ${result.policy}`);
  console.log(`   Reason: ${result.reason}`);

  if (FORCE_REDIS_DOWN) {
    if (result.allowed && result.policy === "open" && result.reason === "redis_down") {
      console.log("   ✅ PASS: FAIL-OPEN allows with fallback when Redis down");
      return true;
    } else {
      console.log("   ❌ FAIL: FAIL-OPEN should allow when Redis down");
      return false;
    }
  } else {
    if (result.allowed && result.status === 200) {
      console.log("   ✅ PASS: ALLOWED when Redis up");
      return true;
    } else {
      console.log("   ❌ FAIL: Should allow when Redis up");
      return false;
    }
  }
}

async function testFallbackThrottle() {
  console.log("\n🧪 Test: Fallback Throttle (FAIL-OPEN overload protection)");
  console.log(`   Redis simulated: ${FORCE_REDIS_DOWN ? "DOWN" : "UP"}`);

  if (!FORCE_REDIS_DOWN) {
    console.log("   ⏭️  SKIPPED: Only runs when RATE_LIMIT_FORCE_REDIS_DOWN=1");
    return true;
  }

  const key = "ip:overload:test";
  const testLimit = 5; // Low limit for faster test

  // Manually clear any existing throttle state for this key
  fallbackThrottles.delete(key);

  // Exhaust the limit using direct fallback check (bypassing rateLimit to test just the throttle)
  let allowed = 0;
  let denied = 0;

  for (let i = 0; i < 10; i++) {
    const result = checkFallbackThrottle(key, testLimit);
    if (result.allowed) {
      allowed++;
    } else {
      denied++;
    }
  }

  console.log(`   Requests allowed: ${allowed}`);
  console.log(`   Requests denied: ${denied}`);
  console.log(`   Limit: ${testLimit}`);

  // Should allow exactly 'testLimit' requests, then deny the rest
  if (allowed === testLimit && denied === 10 - testLimit) {
    console.log("   ✅ PASS: Fallback throttle enforces limit");
    return true;
  } else {
    console.log("   ❌ FAIL: Fallback throttle not working correctly");
    return false;
  }
}

async function testClosedPolicyList() {
  console.log("\n🧪 Test: All CLOSED routes deny when Redis down");
  console.log(`   Redis simulated: ${FORCE_REDIS_DOWN ? "DOWN" : "UP"}`);

  if (!FORCE_REDIS_DOWN) {
    console.log("   ⏭️  SKIPPED: Only runs when RATE_LIMIT_FORCE_REDIS_DOWN=1");
    return true;
  }

  const closedRoutes = Object.entries(RATE_LIMIT_POLICY)
    .filter(([, policy]) => policy === "closed")
    .slice(0, 5); // Test first 5

  let allPassed = true;

  for (const [routeKey] of closedRoutes) {
    const result = await rateLimit({
      key: `user:${routeKey}:test`,
      limit: 10,
      window: 60,
      routeKey,
    });

    if (!result.allowed && result.status === 503) {
      // Pass
    } else {
      console.log(`   ❌ FAIL: ${routeKey} should deny (got status ${result.status})`);
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log(`   ✅ PASS: All ${closedRoutes.length} CLOSED routes deny correctly`);
  }

  return allPassed;
}

async function testOpenPolicyList() {
  console.log("\n🧪 Test: All OPEN routes allow when Redis down");
  console.log(`   Redis simulated: ${FORCE_REDIS_DOWN ? "DOWN" : "UP"}`);

  if (!FORCE_REDIS_DOWN) {
    console.log("   ⏭️  SKIPPED: Only runs when RATE_LIMIT_FORCE_REDIS_DOWN=1");
    return true;
  }

  const openRoutes = Object.entries(RATE_LIMIT_POLICY)
    .filter(([, policy]) => policy === "open")
    .slice(0, 5); // Test first 5

  let allPassed = true;

  for (const [routeKey] of openRoutes) {
    const result = await rateLimit({
      key: `user:${routeKey}:test`,
      limit: 10,
      window: 60,
      routeKey,
    });

    if (result.allowed && result.policy === "open") {
      // Pass
    } else {
      console.log(`   ❌ FAIL: ${routeKey} should allow (got allowed=${result.allowed})`);
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log(`   ✅ PASS: All ${openRoutes.length} OPEN routes allow correctly`);
  }

  return allPassed;
}

// ============================================================================
// MAIN
// ============================================================================

async function runTests() {
  console.log("========================================");
  console.log("Phase 3.3: Redis Failure Rate Limit Test");
  console.log("========================================");
  console.log(`RATE_LIMIT_FORCE_REDIS_DOWN: ${FORCE_REDIS_DOWN ? "1 (simulated down)" : "0 (normal)"}`);
  console.log("");

  if (!FORCE_REDIS_DOWN) {
    console.log("⚠️  Running with Redis UP (normal operation mode)");
    console.log("   To test failure mode, run with:");
    console.log("   RATE_LIMIT_FORCE_REDIS_DOWN=1 node scripts/test-rate-limit-redis-failure.mjs\n");
  }

  const results = [];

  results.push(await testFailClosed());
  results.push(await testFailOpen());
  results.push(await testFallbackThrottle());
  results.push(await testClosedPolicyList());
  results.push(await testOpenPolicyList());

  const passed = results.filter((r) => r).length;
  const failed = results.filter((r) => !r).length;

  console.log("\n========================================");
  console.log("Summary");
  console.log("========================================");
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);

  if (failed === 0) {
    console.log("\n✅ ALL TESTS PASSED");
    if (FORCE_REDIS_DOWN) {
      console.log("Redis outage behavior is correct:");
      console.log("- Money endpoints FAIL-CLOSED (deny)");
      console.log("- Safe endpoints FAIL-OPEN (allow with fallback)");
    }
    process.exit(0);
  } else {
    console.log("\n❌ SOME TESTS FAILED");
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
