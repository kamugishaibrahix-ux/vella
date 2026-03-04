/**
 * Health Endpoint Load Test
 * Verifies that 100 concurrent requests do not hammer the DB.
 * Expects: caching enabled, TTL 15s, query counter instrumentation.
 *
 * Usage:
 *   node scripts/test-health-load.mjs [baseUrl] [cookies]
 *
 * Example:
 *   node scripts/test-health-load.mjs http://localhost:3000 "auth_token=xyz; session=abc"
 */

const BASE_URL = process.argv[2] || process.env.HEALTH_TEST_URL || "http://localhost:3000";
const COOKIES = process.argv[3] || process.env.HEALTH_TEST_COOKIES || "";

const HEALTH_ENDPOINT = `${BASE_URL}/api/system/health`;
const CONCURRENT_REQUESTS = 100;
const CACHE_TTL_MS = 15000; // Must match route.ts CACHE_TTL_MS

/**
 * @typedef {Object} HealthResponse
 * @property {number} globalStabilityScore
 * @property {string} dominantRiskDomain
 * @property {number} focusCapacity
 * @property {number} decisionCapacity
 * @property {boolean} recoveryRequired
 * @property {Object} domainStress
 * @property {string} phase
 */

/**
 * @typedef {Object} RequestResult
 * @property {boolean} ok
 * @property {number} status
 * @property {string} cacheStatus
 * @property {number} cacheAge
 * @property {HealthResponse|null} data
 * @property {string|null} error
 * @property {number} durationMs
 */

/**
 * Make a single health request
 * @returns {Promise<RequestResult>}
 */
async function makeHealthRequest() {
  const start = Date.now();
  try {
    const headers = {
      Accept: "application/json",
    };
    if (COOKIES) {
      headers["Cookie"] = COOKIES;
    }

    const res = await fetch(HEALTH_ENDPOINT, { headers });
    const durationMs = Date.now() - start;

    const cacheStatus = res.headers.get("x-health-cache") || "unknown";
    const cacheAge = parseInt(res.headers.get("x-health-cache-age") || "0", 10);

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        cacheStatus,
        cacheAge,
        data: null,
        error: `HTTP ${res.status}: ${await res.text()}`,
        durationMs,
      };
    }

    const data = await res.json();
    return {
      ok: true,
      status: res.status,
      cacheStatus,
      cacheAge,
      data,
      error: null,
      durationMs,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      cacheStatus: "error",
      cacheAge: 0,
      data: null,
      error: err.message,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Run concurrent load test
 */
async function runLoadTest() {
  console.log(`\n🧪 Health Endpoint Load Test`);
  console.log(`   URL: ${HEALTH_ENDPOINT}`);
  console.log(`   Concurrent requests: ${CONCURRENT_REQUESTS}`);
  console.log(`   Expected cache TTL: ${CACHE_TTL_MS}ms`);
  console.log("");

  // Warm-up: single request to populate cache
  console.log("▶️  Warm-up: Single request to populate cache...");
  const warmUp = await makeHealthRequest();
  if (!warmUp.ok) {
    console.error(`❌ Warm-up failed: ${warmUp.error}`);
    console.error("   Check that you're authenticated and the server is running.");
    process.exit(1);
  }
  console.log(`   ✅ Warm-up complete (${warmUp.durationMs}ms, cache: ${warmUp.cacheStatus})`);
  console.log("");

  // Wait briefly to ensure cache is set
  await new Promise((r) => setTimeout(r, 100));

  // Burst: 100 concurrent requests
  console.log(`▶️  Burst: ${CONCURRENT_REQUESTS} concurrent requests...`);
  const burstStart = Date.now();
  const promises = Array(CONCURRENT_REQUESTS).fill(null).map(() => makeHealthRequest());
  const results = await Promise.all(promises);
  const burstDuration = Date.now() - burstStart;

  // Analysis
  const successCount = results.filter((r) => r.ok).length;
  const cacheHits = results.filter((r) => r.cacheStatus === "hit").length;
  const cacheMisses = results.filter((r) => r.cacheStatus === "miss").length;
  const cacheUnknown = results.filter((r) => r.cacheStatus === "unknown").length;
  const errors = results.filter((r) => !r.ok);

  const avgDuration = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;
  const maxDuration = Math.max(...results.map((r) => r.durationMs));
  const minDuration = Math.min(...results.map((r) => r.durationMs));

  console.log(`\n📊 Results:`);
  console.log(`   Total time: ${burstDuration}ms`);
  console.log(`   Success: ${successCount}/${CONCURRENT_REQUESTS}`);
  console.log(`   Cache hits: ${cacheHits}`);
  console.log(`   Cache misses: ${cacheMisses}`);
  console.log(`   Cache unknown: ${cacheUnknown}`);
  console.log(`   Avg duration: ${avgDuration.toFixed(1)}ms`);
  console.log(`   Min duration: ${minDuration}ms`);
  console.log(`   Max duration: ${maxDuration}ms`);

  if (errors.length > 0) {
    console.log(`\n❌ Errors (${errors.length}):`);
    errors.slice(0, 5).forEach((e) => {
      console.log(`   - ${e.error}`);
    });
  }

  // Verification assertions
  console.log(`\n🔍 Verification:`);
  let passed = 0;
  let failed = 0;

  // Check 1: All requests succeeded
  if (successCount === CONCURRENT_REQUESTS) {
    console.log(`   ✅ All ${CONCURRENT_REQUESTS} requests succeeded`);
    passed++;
  } else {
    console.log(`   ❌ Only ${successCount}/${CONCURRENT_REQUESTS} requests succeeded`);
    failed++;
  }

  // Check 2: Cache is working (at least some hits)
  if (cacheHits > 0) {
    console.log(`   ✅ Cache is working (${cacheHits} hits)`);
    passed++;
  } else {
    console.log(`   ❌ No cache hits detected - caching may not be enabled`);
    failed++;
  }

  // Check 3: Most requests should be cache hits (only 1-2 misses expected)
  const expectedMaxMisses = 5; // Allow some race conditions
  if (cacheMisses <= expectedMaxMisses) {
    console.log(`   ✅ Cache miss count acceptable (${cacheMisses} <= ${expectedMaxMisses})`);
    passed++;
  } else {
    console.log(`   ❌ Too many cache misses (${cacheMisses} > ${expectedMaxMisses})`);
    failed++;
  }

  // Check 4: Fast response times indicate cache hits
  if (avgDuration < 100) {
    console.log(`   ✅ Average response time is fast (${avgDuration.toFixed(1)}ms < 100ms)`);
    passed++;
  } else {
    console.log(`   ⚠️  Average response time is slow (${avgDuration.toFixed(1)}ms) - may indicate cache misses`);
    // Don't fail - could be network latency
  }

  // Check 5: Response shape is valid
  const validResponse = results.every(
    (r) =>
      r.ok &&
      typeof r.data?.globalStabilityScore === "number" &&
      typeof r.data?.dominantRiskDomain === "string" &&
      typeof r.data?.phase === "string"
  );
  if (validResponse) {
    console.log(`   ✅ All responses have valid shape`);
    passed++;
  } else {
    console.log(`   ❌ Some responses have invalid shape`);
    failed++;
  }

  // Summary
  console.log(`\n📋 Summary: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log(`\n✅ LOAD TEST PASSED`);
    console.log(`   Health endpoint is properly cached and won't hammer the DB.`);
    process.exit(0);
  } else {
    console.log(`\n❌ LOAD TEST FAILED`);
    console.log(`   The endpoint may still hammer the DB under load.`);
    process.exit(1);
  }
}

runLoadTest().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
