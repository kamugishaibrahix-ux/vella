# Long-Uptime Memory Stability Verification Report

**Date:** 2026-03-01  
**Objective:** Ensure no in-memory structure grows unbounded.

---

## Executive Summary

| Category | Structures Scanned | Bounded | Unbounded Risk |
|----------|-------------------|---------|----------------|
| Observability Counters | 10 | ✅ 10 | 0 |
| Histograms | 1 | ✅ 1 | 0 |
| Circuit Breaker State | 1 | ✅ 1 | 0 |
| Rate Limit Stores | 2 | ⚠️  1* | 1* |
| Caches & Lookup Maps | 6 | ✅ 5 | 1 |
| Per-Request Buffers | 4 | ⚠️  4** | 0 |

*With caveats - see detailed analysis below  
**Per-session/request lifetime only

**Overall Risk Level:** MEDIUM - Two structures require attention for long-uptime scenarios.

---

## Detailed Structure Analysis

### 1. Observability Counters ✅ BOUNDED

**File:** `MOBILE/lib/security/observability.ts` (lines 34-44)

```typescript
const counters = {
  rateLimited: 0,
  quotaExceeded: 0,
  openAIFailures: 0,
  openAISuccesses: 0,
  tokenDeductCount: 0,
  tokenRefundCount: 0,
  rateLimit503Count: 0,
  dbUnavailableCount: 0,
  stripeWebhookDuplicateCount: 0,
};
```

| Property | Value |
|----------|-------|
| Type | Fixed object with 10 scalar counters |
| Growth | None - fixed structure |
| Max Memory | ~80 bytes (10 × 8-byte numbers) |
| Bounded | ✅ YES |

---

### 2. Latency Histogram ✅ BOUNDED

**File:** `MOBILE/lib/security/observability.ts` (lines 47-48)

```typescript
const openAILatencyBuckets = [100, 250, 500, 1000, 2000, 5000];
const openAILatencyCounts = [0, 0, 0, 0, 0, 0, 0]; // 7 buckets (last is 5000+)
```

| Property | Value |
|----------|-------|
| Type | Fixed-size array (7 buckets) |
| Growth | None - fixed 7-element array |
| Max Memory | ~56 bytes (7 × 8-byte numbers) |
| Bounded | ✅ YES |

**Verification:** Histogram uses fixed bucket arrays as required.

---

### 3. Circuit Breaker State ✅ BOUNDED

**File:** `MOBILE/lib/ai/circuitBreaker/memoryStore.ts` (lines 7-11)

```typescript
export class MemoryCircuitBreakerStore {
  private state: State = "closed";
  private failureTimes: number[] = [];
  private openedAt: number = 0;
```

| Property | Value |
|----------|-------|
| Type | Single instance with sliding window |
| Growth | `failureTimes` is bounded by time window (60s default) |
| Max Entries | ~60 (one failure per second in window) |
| Cleanup | Automatic - old entries filtered on each check |
| Bounded | ✅ YES |

**Analysis:** The `failureTimes` array is pruned to only keep entries within the sliding window (line 28). Even under extreme load (1000 failures/second), the array would only retain 60 entries (one per millisecond timestamp within window).

---

### 4. Rate Limit Stores ⚠️  ATTENTION REQUIRED

#### 4a. MemoryRateLimitStore ⚠️  RISK

**File:** `MOBILE/lib/security/rateLimit/memoryStore.ts` (lines 4-5)

```typescript
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, number[]>();
```

| Property | Value |
|----------|-------|
| Type | Map of key → timestamp array |
| Growth | Per unique key - entries never removed, only pruned on access |
| Risk | Unbounded if many unique users/IPs hit rate limiter once |
| Cleanup | Only when key is accessed again |
| Bounded | ⚠️  NO - requires periodic cleanup |

**Code Analysis (line 17-28):**
```typescript
const recent = timestamps.filter((ts) => now - ts < windowMs);
// ...
this.buckets.set(key, [...recent, now]);
```

**Issue:** Old keys that are never accessed again remain in the Map forever. With 100k unique users each making one request, the Map grows to 100k entries and never shrinks.

#### 4b. Fallback Throttles ⚠️  RISK

**File:** `MOBILE/lib/security/rateLimit.ts` (lines 165-196)

```typescript
const fallbackThrottles = new Map<string, FallbackEntry>();
```

| Property | Value |
|----------|-------|
| Type | Map of key → { count, resetAt } |
| Growth | Per unique key - entries never removed |
| Risk | Unbounded growth with unique users/IPs |
| Cleanup | Only on access after resetAt |
| Bounded | ⚠️  NO - requires periodic cleanup |

**Issue:** Same pattern - stale entries for keys that never return are never cleaned up.

**Recommendation:** Add periodic cleanup job:
```typescript
// Add to rateLimit.ts - cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of fallbackThrottles) {
    if (now >= entry.resetAt) {
      fallbackThrottles.delete(key);
    }
  }
}, 300000);
```

---

### 5. Static Lookup Maps ✅ BOUNDED

These maps are populated once at module load and never grow:

| Map/Set | File | Size | Bounded |
|---------|------|------|---------|
| `PRESET_BY_ID` | `vellaAudioCatalog.ts` | ~20 entries | ✅ Static |
| `PRESET_BY_MODE` | `vellaAudioCatalog.ts` | ~5 entries | ✅ Static |
| `SENSITIVE_KEYS` | `logGuard.ts` | ~28 entries | ✅ Static |
| `ALLOWED_TEXT_MODELS` | `adminConfig.ts` | ~2 entries | ✅ Static |
| `ALLOWED_REALTIME_MODELS` | `adminConfig.ts` | ~2 entries | ✅ Static |
| `ALLOWED_EMBEDDING_MODELS` | `adminConfig.ts` | ~2 entries | ✅ Static |
| `VALID_SUBJECT_CODES` | `focusEngine.ts` | ~8 entries | ✅ Static |
| `BANNED_FIELDS` | `safeSupabaseWrite.ts` | ~15 entries | ✅ Static |
| `WRITE_BLOCKED_TABLES` | `safeSupabaseWrite.ts` | ~7 entries | ✅ Static |
| `PII_FORBIDDEN_FIELDS` | `piiFirewall.ts` | ~20 entries | ✅ Static |

---

### 6. Per-Request/Session Buffers ⚠️  SHORT-LIVED

These structures are created per-request or per-session and should be garbage collected:

| Structure | File | Lifetime | Risk |
|-----------|------|----------|------|
| `assistantTextByResponseId` | `realtimeClient.ts` | Session | ⚠️ Cleared on session end? |
| `pseudoSingingByResponseId` | `realtimeClient.ts` | Session | ⚠️ Check cleanup |
| `responseMoodById` | `realtimeClient.ts` | Session | ⚠️ Check cleanup |
| `bufferCache` | `vellaUnifiedAudio.ts` | Global | ⚠️ No eviction policy |
| `recentAssistantOutputs` | `realtimeClient.ts` | Session (max 6) | ✅ Bounded by MAX_MEMORY |

**Risk:** The `bufferCache` in `vellaUnifiedAudio.ts` has no size limit or eviction policy. Audio buffers can be large (MBs each).

---

## Risk Summary Table

| Structure | File | bounded (Y/N) | Max Size | Risk Level |
|-----------|------|---------------|----------|------------|
| Observability counters | `observability.ts` | Y | 10 scalars | None |
| OpenAI latency histogram | `observability.ts` | Y | 7 buckets | None |
| Circuit breaker state | `circuitBreaker/memoryStore.ts` | Y | ~60 entries | None |
| Rate limit buckets | `rateLimit/memoryStore.ts` | **N** | Unbounded | **HIGH** |
| Fallback throttles | `rateLimit.ts` | **N** | Unbounded | **MEDIUM** |
| Audio buffer cache | `vellaUnifiedAudio.ts` | **N** | Unbounded | **HIGH** |
| Realtime response maps | `realtimeClient.ts` | Session | Per-session | Low |
| Static lookup maps | Various | Y | Static | None |

---

## Simulation Protocol

### 10k Request Memory Test Script

```typescript
// MOBILE/scripts/memory-stability-test.ts

import { memoryUsage } from "process";

async function simulate10kRequests() {
  const { MemoryRateLimitStore } = await import("@/lib/security/rateLimit/memoryStore");
  const store = new MemoryRateLimitStore();
  
  // Measure baseline
  if (global.gc) global.gc();
  const baseline = memoryUsage();
  
  console.log("=== 10k Request Memory Simulation ===");
  console.log(`Baseline RSS: ${Math.round(baseline.rss / 1024 / 1024)}MB`);
  
  // Simulate 10k unique users (worst case)
  for (let i = 0; i < 10000; i++) {
    const key = `user:${i}:test_route`;
    await store.consume(key, 60000, 100); // windowMs=60s, max=100
    
    if (i % 1000 === 0) {
      const current = memoryUsage();
      console.log(`After ${i} requests: RSS=${Math.round(current.rss / 1024 / 1024)}MB (+${Math.round((current.rss - baseline.rss) / 1024)}KB)`);
    }
  }
  
  // Measure final
  const final = memoryUsage();
  const growth = final.rss - baseline.rss;
  
  console.log(`\n=== Results ===`);
  console.log(`Final RSS: ${Math.round(final.rss / 1024 / 1024)}MB`);
  console.log(`Growth: ${Math.round(growth / 1024)}KB`);
  console.log(`Per-request overhead: ${Math.round(growth / 10000)} bytes`);
  console.log(`Bounded: ${growth < 10 * 1024 * 1024 ? "✅ YES" : "❌ NO (>10MB growth)"}`);
  
  return { baseline, final, growth };
}

simulate10kRequests();
```

### Expected Results

| Metric | Acceptable Threshold | Actual (Estimated) |
|--------|---------------------|------------------|
| RSS Growth | < 10MB | ~50MB (unbounded Maps) |
| Heap Used Growth | < 5MB | ~30MB |
| External Memory | Stable | Minimal |

---

## Recommendations

### Immediate (High Priority)

1. **Add TTL-based cleanup to MemoryRateLimitStore:**
   ```typescript
   // Add periodic cleanup to prevent unbounded growth
   setInterval(() => {
     const now = Date.now();
     for (const [key, timestamps] of this.buckets) {
       const recent = timestamps.filter(ts => now - ts < windowMs);
       if (recent.length === 0) {
         this.buckets.delete(key);
       } else {
         this.buckets.set(key, recent);
       }
     }
   }, 60000); // Every minute
   ```

2. **Add cleanup to fallbackThrottles:**
   ```typescript
   // In rateLimit.ts
   setInterval(() => {
     const now = Date.now();
     for (const [key, entry] of fallbackThrottles) {
       if (now >= entry.resetAt) {
         fallbackThrottles.delete(key);
       }
     }
   }, 300000); // Every 5 minutes
   ```

### Short-term

3. **Add LRU eviction to audio buffer cache:**
   - Max 50 entries
   - Evict oldest when full
   - Add size limit (max 100MB total)

4. **Verify realtime client cleanup:**
   - Ensure `assistantTextByResponseId` is cleared when response completes
   - Ensure session-end cleanup for all per-session Maps

### Long-term

5. **Consider Redis for all rate limiting in production:**
   - The memory store is only for dev/single-instance
   - Production should always use Redis

6. **Add memory metrics to health checks:**
   - Alert if RSS growth exceeds threshold
   - Track heap usage trends

---

## Sign-off

| Check | Status |
|-------|--------|
| Histograms use fixed bucket arrays | ✅ PASS |
| No requestId sets stored in memory | ✅ PASS |
| No per-user maps that accumulate | ⚠️  2 maps need cleanup |
| 10k request simulation run | ❌ NOT RUN |
| Memory growth confirmed bounded | ❌ UNBOUNDED GROWTH DETECTED |

**Verdict:** Two structures (`MemoryRateLimitStore.buckets` and `fallbackThrottles`) exhibit unbounded growth under load. Recommendations provided above.

---

*Report generated as part of SYSTEM TASK: Long-Uptime Memory Stability Verification*
