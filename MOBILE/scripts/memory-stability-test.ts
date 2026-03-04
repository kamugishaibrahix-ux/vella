/**
 * Memory Stability Test Script
 * Simulates 10k requests to verify bounded memory growth.
 *
 * Run with: npx ts-node scripts/memory-stability-test.ts
 * Or: node --expose-gc dist/scripts/memory-stability-test.js
 */

import { memoryUsage } from "process";

// Import the stores we need to test
import { MemoryRateLimitStore } from "../lib/security/rateLimit/memoryStore";

interface TestResult {
  baseline: NodeJS.MemoryUsage;
  final: NodeJS.MemoryUsage;
  growth: number;
  perRequestBytes: number;
  bounded: boolean;
}

async function runMemoryTest(
  name: string,
  testFn: () => Promise<void>,
  requestCount: number
): Promise<TestResult> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Test: ${name}`);
  console.log(`${"=".repeat(60)}`);

  // Force GC if available
  if (global.gc) {
    global.gc();
    global.gc(); // Double GC to ensure cleanup
  }

  // Wait for any pending cleanup
  await new Promise((resolve) => setTimeout(resolve, 100));

  const baseline = memoryUsage();
  console.log(`Baseline RSS: ${formatBytes(baseline.rss)}`);
  console.log(`Baseline Heap: ${formatBytes(baseline.heapUsed)}`);
  console.log(`Baseline External: ${formatBytes(baseline.external)}`);

  // Run the test
  await testFn();

  // Force GC if available
  if (global.gc) {
    global.gc();
    global.gc();
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  const final = memoryUsage();
  const growth = final.rss - baseline.rss;
  const perRequestBytes = Math.round(growth / requestCount);
  const bounded = growth < 10 * 1024 * 1024; // 10MB threshold

  console.log(`\nFinal RSS: ${formatBytes(final.rss)}`);
  console.log(`Final Heap: ${formatBytes(final.heapUsed)}`);
  console.log(`RSS Growth: ${formatBytes(growth)} (${perRequestBytes} bytes/request)`);
  console.log(`Bounded (<10MB): ${bounded ? "✅ YES" : "❌ NO"}`);

  return { baseline, final, growth, perRequestBytes, bounded };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

async function testRateLimitMemoryStore(): Promise<TestResult> {
  const store = new MemoryRateLimitStore();
  const REQUEST_COUNT = 10000;

  return runMemoryTest(
    "MemoryRateLimitStore - 10k unique keys",
    async () => {
      for (let i = 0; i < REQUEST_COUNT; i++) {
        const key = `user:${i}:test_route`;
        await store.consume(key, 60000, 100); // windowMs=60s, max=100

        if (i % 2000 === 0 && i > 0) {
          const current = memoryUsage();
          console.log(
            `  After ${i} requests: RSS=${formatBytes(current.rss)}, Heap=${formatBytes(
              current.heapUsed
            )}`
          );
        }
      }
    },
    REQUEST_COUNT
  );
}

async function testRateLimitMemoryStoreWithReuse(): Promise<TestResult> {
  const store = new MemoryRateLimitStore();
  const UNIQUE_KEYS = 100;
  const REQUESTS_PER_KEY = 100;
  const TOTAL_REQUESTS = UNIQUE_KEYS * REQUESTS_PER_KEY;

  return runMemoryTest(
    "MemoryRateLimitStore - 100 keys x 100 requests each",
    async () => {
      for (let i = 0; i < TOTAL_REQUESTS; i++) {
        const key = `user:${i % UNIQUE_KEYS}:test_route`;
        await store.consume(key, 60000, 100);

        if (i % 10000 === 0 && i > 0) {
          const current = memoryUsage();
          console.log(
            `  After ${i} requests: RSS=${formatBytes(current.rss)}, Heap=${formatBytes(
              current.heapUsed
            )}`
          );
        }
      }
    },
    TOTAL_REQUESTS
  );
}

async function testRateLimitMemoryStoreOldKeyCleanup(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Test: MemoryRateLimitStore - Old Key Cleanup Verification");
  console.log(`${"=".repeat(60)}`);

  const store = new MemoryRateLimitStore();
  const windowMs = 1000; // 1 second window for fast testing

  // Add some keys
  for (let i = 0; i < 100; i++) {
    const key = `user:${i}:test`;
    await store.consume(key, windowMs, 10);
  }

  const afterAdd = memoryUsage();
  console.log(`After adding 100 keys: RSS=${formatBytes(afterAdd.rss)}`);

  // Wait for window to expire
  console.log("Waiting 1.5 seconds for window to expire...");
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Access a key to trigger cleanup
  await store.consume("user:0:test", windowMs, 10);

  const afterCleanup = memoryUsage();
  console.log(`After accessing one key (cleanup): RSS=${formatBytes(afterCleanup.rss)}`);

  // Access all keys to trigger cleanup on all
  for (let i = 0; i < 100; i++) {
    await store.consume(`user:${i}:test`, windowMs, 10);
  }

  const afterAllAccess = memoryUsage();
  console.log(`After accessing all keys: RSS=${formatBytes(afterAllAccess.rss)}`);

  // Check if old entries were cleaned
  const growth = afterAllAccess.rss - afterAdd.rss;
  console.log(`\nNet growth after cleanup cycle: ${formatBytes(growth)}`);
  console.log(`Cleanup effective: ${growth < 1024 * 1024 ? "✅ YES" : "❌ NO (>1MB retained)"}`);
}

async function main(): Promise<void> {
  console.log("Memory Stability Test Suite");
  console.log("===========================");
  console.log("Node version:", process.version);
  console.log("GC available:", !!global.gc);
  console.log("");

  if (!global.gc) {
    console.warn("⚠️  WARNING: --expose-gc flag not set. Results may be less accurate.");
    console.warn("   Run with: node --expose-gc scripts/memory-stability-test.js\n");
  }

  const results: { name: string; result: TestResult }[] = [];

  // Test 1: 10k unique keys (worst case for unbounded growth)
  const result1 = await testRateLimitMemoryStore();
  results.push({ name: "RateLimit Store (unique keys)", result: result1 });

  // Test 2: 100 keys reused (typical case)
  const result2 = await testRateLimitMemoryStoreWithReuse();
  results.push({ name: "RateLimit Store (key reuse)", result: result2 });

  // Test 3: Verify cleanup behavior
  await testRateLimitMemoryStoreOldKeyCleanup();

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(60)}`);

  for (const { name, result } of results) {
    const status = result.bounded ? "✅ BOUNDED" : "❌ UNBOUNDED";
    console.log(`${name}: ${status}`);
    console.log(`  Growth: ${formatBytes(result.growth)} (${result.perRequestBytes} bytes/request)`);
  }

  // Final verdict
  const allBounded = results.every((r) => r.result.bounded);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`OVERALL: ${allBounded ? "✅ ALL BOUNDED" : "❌ UNBOUNDED GROWTH DETECTED"}`);
  console.log(`${"=".repeat(60)}`);

  process.exit(allBounded ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
}

export { runMemoryTest, testRateLimitMemoryStore, formatBytes };
