# Client Abort Refund Safety Verification Report

**Date:** 2026-03-01  
**Objective:** Verify that if the client aborts the HTTP request mid-flight, token refund still executes.

---

## Executive Summary

| Status | Count | Routes |
|--------|-------|--------|
| ✅ PASS | 13 | All monetized routes properly await refundTokensForOperation |
| ⚠️  NEEDS_INSTRUMENTATION | 13 | Routes need lifecycle logging for abort detection |
| ❌ NO_ABORT_PROTECTION | 13 | Routes lack explicit client disconnect handling |

**Key Finding:** While all routes properly await `refundTokensForOperation` in their error handlers, **none have explicit protection against client aborts during the OpenAI call**. If a client disconnects mid-flight, the route handler may terminate before executing the refund logic.

---

## Route-by-Route Analysis

### AI Text Routes

| Route | refundTokensForOperation Awaited | Early Return After Charge | Has `charged` Flag | Client Abort Protection | refund_after_abort |
|-------|----------------------------------|---------------------------|-------------------|------------------------|-------------------|
| `/api/clarity` | ✅ Yes | ✅ No | ❌ No | ❌ No | **N** |
| `/api/strategy` | ✅ Yes | ✅ No | ❌ No | ❌ No | **N** |
| `/api/compass` | ✅ Yes | ✅ No | ❌ No | ❌ No | **N** |
| `/api/deepdive` | ✅ Yes | ✅ No | ✅ Yes | ❌ No | **N** |
| `/api/reflection` | ✅ Yes | ✅ No | ✅ Yes | ❌ No | **N** |
| `/api/architect` | ✅ Yes | ✅ No | ✅ Yes | ❌ No | **N** |
| `/api/growth-roadmap` | ✅ Yes | ✅ No | ✅ Yes | ❌ No | **N** |
| `/api/emotion-intel` | ✅ Yes | ✅ No | ❌ No | ❌ No | **N** |
| `/api/insights/generate` | ✅ Yes | ✅ No | ✅ Yes | ❌ No | **N** |
| `/api/insights/patterns` | ✅ Yes | ✅ No | ❌ No | ❌ No | **N** |
| `/api/vella/text` | ✅ Yes | ✅ No | ❌ No | ❌ No | **N** |

### Audio/Voice Routes

| Route | refundTokensForOperation Awaited | Early Return After Charge | Has `charged` Flag | Client Abort Protection | refund_after_abort |
|-------|----------------------------------|---------------------------|-------------------|------------------------|-------------------|
| `/api/transcribe` | ✅ Yes | ✅ No | ❌ No | ❌ No | **N** |
| `/api/audio/vella` | ✅ Yes | ✅ No | ✅ Yes | ❌ No | **N** |
| `/api/realtime/offer` | ✅ Yes | ✅ No | ❌ No | ❌ No | **N** |

---

## Detailed Findings

### 1. Refund Pattern Verification ✅

**All 13 monetized routes correctly:**
- Await `refundTokensForOperation()` (or use `.catch(() => {})` for error suppression in catch blocks)
- Use the SAME `requestId` for both charge and refund (ensuring idempotency)
- Have NO early returns after charge but before try/catch

### 2. The `charged` Flag Pattern

Routes using the `charged` boolean flag (safer pattern):
- `/api/deepdive/route.ts` (line 47, 82)
- `/api/reflection/route.ts` (line 59, 96)
- `/api/architect/route.ts` (line 33, 63)
- `/api/growth-roadmap/route.ts` (line 44, 88)
- `/api/insights/generate/route.ts` (line 285)
- `/api/audio/vella/route.ts` (line 51, 101)

This pattern prevents refund attempts when charge never succeeded, avoiding unnecessary database calls.

### 3. Client Abort Risk ❌

**Critical Gap:** None of the routes have explicit handling for `AbortSignal` or client disconnect detection during the OpenAI call. The current flow:

```
1. Charge tokens
2. Call OpenAI (may take 5-30 seconds)
3. If client aborts here → handler terminates
4. Catch block never executes
5. Refund never happens
```

**Recommended Solution:**
Add abort signal propagation and cleanup handlers:

```typescript
// Add to routes with long-running OpenAI calls
const abortController = new AbortController();
req.signal?.addEventListener('abort', async () => {
  abortController.abort();
  // Trigger refund via side-channel or cleanup hook
});

// Pass signal to OpenAI
await openai.chat.completions.create({
  ...params,
  signal: abortController.signal,
});
```

---

## Instrumentation Requirements

All routes need these lifecycle log points:

```typescript
// BEFORE charge
logTokenLedgerEvent({ eventType: "charge_start", userId, requestId, route });

// AFTER charge (success)
logTokenLedgerEvent({ eventType: "charge_complete", userId, requestId, route, tokens: estimatedTokens });

// BEFORE OpenAI
logTokenLedgerEvent({ eventType: "openai_start", userId, requestId, route });

// AFTER OpenAI (success)
logTokenLedgerEvent({ eventType: "openai_complete", userId, requestId, route });

// REFUND start
logTokenLedgerEvent({ eventType: "refund_start", userId, requestId, route, reason });

// REFUND complete
logTokenLedgerEvent({ eventType: "refund_complete", userId, requestId, route, refundedAmount });
```

---

## Simulation: Client Abort During OpenAI Call

### Test Protocol

To verify refund executes on client abort:

```typescript
// Test script using AbortController
async function simulateClientAbort() {
  const controller = new AbortController();
  
  // Start request
  const promise = fetch('/api/clarity', {
    method: 'POST',
    body: JSON.stringify({ freeText: "test", frame: "test" }),
    signal: controller.signal,
  });
  
  // Abort after 100ms (during OpenAI call)
  setTimeout(() => controller.abort(), 100);
  
  try {
    await promise;
  } catch (e) {
    // Expected AbortError
  }
  
  // Check logs for refund_complete event
  // Should see: eventType="refund_complete", route="clarity"
}
```

### Expected Log Sequence (Success Case)

```
charge_start     { route: "clarity", userId, requestId }
charge_complete  { route: "clarity", userId, requestId, tokens }
openai_start     { route: "clarity", userId, requestId }
openai_complete  { route: "clarity", userId, requestId, success: true }
```

### Expected Log Sequence (Client Abort Case)

```
charge_start     { route: "clarity", userId, requestId }
charge_complete  { route: "clarity", userId, requestId, tokens }
openai_start     { route: "clarity", userId, requestId }
refund_start     { route: "clarity", userId, requestId, reason: "client_abort" }
refund_complete  { route: "clarity", userId, requestId, refundedAmount }
```

### Current Status: ⚠️ NOT IMPLEMENTED

**CRITICAL:** The current implementation does NOT guarantee refund on client abort because:

1. No `req.signal` listener is attached to detect client disconnect
2. No cleanup hook triggers refund when response is closed mid-flight
3. The catch block may not execute if the handler terminates abruptly

**To implement client abort protection, add:**

```typescript
// At route entry (after charge)
let refunded = false;
res.on('close', async () => {
  if (!responseSent && !refunded && charged) {
    refunded = true;
    logTokenLedgerEvent({ eventType: "refund_start", reason: "client_disconnect" });
    await refundTokensForOperation(...);
    logTokenLedgerEvent({ eventType: "refund_complete" });
  }
});
```

---

## Recommendations

### Immediate (High Priority)

1. **Add AbortController handling** to all monetized routes
2. **Add lifecycle instrumentation** for observability
3. **Add server-side cleanup hooks** that trigger refund on client disconnect

### Short-term

4. **Consider async cleanup pattern:**
   ```typescript
   // Use Node.js cleanup hooks or Next.js runtime cleanup
   res.on('close', async () => {
     if (!responseSentSuccessfully && charged) {
       await refundTokensForOperation(...);
     }
   });
   ```

5. **Add refund verification job:**
   - Background process that identifies charged-but-not-completed operations
   - Auto-refunds stale charges after timeout

### Long-term

6. **Implement idempotent request tracking:**
   - Store request state in Redis/DB with TTL
   - Cleanup job processes incomplete requests
   - Users can query request status

---

## Verification Commands

```bash
# Verify all monetized routes have refund calls
grep -r "refundTokensForOperation" MOBILE/app/api/*/route.ts MOBILE/app/api/*/*/route.ts 2>/dev/null | wc -l

# Verify no routes use un-awaited refunds
grep -r "refundTokensForOperation" MOBILE/app/api --include="*.ts" | grep -v "await" | grep -v "\.catch"

# Verify all routes use requestId
grep -r "requestId" MOBILE/app/api/*/route.ts MOBILE/app/api/*/*/route.ts | grep -c "crypto.randomUUID"
```

---

## Sign-off

| Check | Status |
|-------|--------|
| All routes await refundTokensForOperation | ✅ PASS |
| No early returns after charge | ✅ PASS |
| Same requestId used for charge/refund | ✅ PASS |
| Instrumentation logs added | ✅ COMPLETED (core functions) |
| Client abort protection implemented | ❌ NOT IMPLEMENTED |
| Simulation test confirms refund on abort | ❌ NOT TESTED |

---

## Final Output: Route Verification Table

| Route | refund_after_abort (Y/N) | Notes |
|-------|-------------------------|-------|
| /api/clarity | **N** | No client disconnect handling |
| /api/strategy | **N** | No client disconnect handling |
| /api/compass | **N** | No client disconnect handling |
| /api/deepdive | **N** | No client disconnect handling |
| /api/reflection | **N** | No client disconnect handling |
| /api/architect | **N** | No client disconnect handling |
| /api/growth-roadmap | **N** | No client disconnect handling |
| /api/emotion-intel | **N** | No client disconnect handling |
| /api/insights/generate | **N** | No client disconnect handling |
| /api/insights/patterns | **N** | No client disconnect handling |
| /api/vella/text | **N** | No client disconnect handling |
| /api/transcribe | **N** | No client disconnect handling |
| /api/audio/vella | **N** | No client disconnect handling |
| /api/realtime/offer | **N** | No client disconnect handling |

**Summary:** 0/14 routes have explicit client abort protection. All routes properly refund on OpenAI failure (caught errors), but none guarantee refund if the client disconnects mid-flight.

---

*Report generated as part of SYSTEM TASK: Client Abort Refund Safety Verification*
*Full report: `MOBILE/docs/ops/CLIENT_ABORT_REFUND_VERIFICATION.md`*
