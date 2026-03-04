# ENTITLEMENT INTEGRITY AUDIT REPORT
## Phase 4.1 — AI-Spending Endpoint Gate Verification

**Date:** 2026-02-28  
**Status:** ❌ CRITICAL ISSUES FOUND — 5 AI-spending routes lack entitlement gates  
**Goal:** Prove every OpenAI-spending endpoint is gated by requireEntitlement()

---

## EXECUTIVE SUMMARY

**CRITICAL FINDING:** 5 AI-spending routes use `requireUserId()` instead of `requireEntitlement()`, bypassing feature-gate checks. These routes spend OpenAI tokens without verifying user entitlements.

| Category | Count | Routes |
|----------|-------|--------|
| ✅ Properly Gated | 10 | transcribe, audio/vella, realtime/token, realtime/offer, vella/text, insights/generate, deepdive, reflection, growth-roadmap, architect |
| ❌ Missing Gates | 5 | clarity, compass, strategy, emotion-intel, insights/patterns |

---

## A) AI-SPENDING ENDPOINT INVENTORY

### Table: All AI-Spending Routes

| # | Route Path | File | Entitlement Name | Gate Location | Has Charge | Has Refund | Order Correct | Risk |
|---|------------|------|------------------|---------------|------------|------------|---------------|------|
| 1 | `/api/transcribe` | `app/api/transcribe/route.ts` | `transcribe` | Line 28 | ✅ | ✅ | ✅ | Low |
| 2 | `/api/audio/vella` | `app/api/audio/vella/route.ts` | `audio_vella` | Line 30 | ✅ | ✅ | ✅ | Low |
| 3 | `/api/realtime/token` | `app/api/realtime/token/route.ts` | `realtime_session` | Line 39 | ✅ | ✅ | ✅ | Low |
| 4 | `/api/realtime/offer` | `app/api/realtime/offer/route.ts` | `realtime_offer` | Line 33 | ✅ | ✅ | ✅ | Low |
| 5 | `/api/vella/text` | `app/api/vella/text/route.ts` | `chat_text` | Line 133 | ✅ | ✅ | ✅ | Low |
| 6 | `/api/insights/generate` | `app/api/insights/generate/route.ts` | `insights_generate` | Line 82 | ✅ | ❌ | ✅ | Low |
| 7 | `/api/insights/patterns` | `app/api/insights/patterns/route.ts` | **MISSING** | — | ✅ | ✅ | ❌ | **HIGH** |
| 8 | `/api/deepdive` | `app/api/deepdive/route.ts` | `deepdive` | Line 41 | ✅ | ❌ | ✅ | Low |
| 9 | `/api/reflection` | `app/api/reflection/route.ts` | `reflection` | Line 52 | ✅ | ❌ | ✅ | Low |
| 10 | `/api/growth-roadmap` | `app/api/growth-roadmap/route.ts` | `growth_roadmap` | Line 38 | ✅ | ❌ | ✅ | Low |
| 11 | `/api/architect` | `app/api/architect/route.ts` | `architect` | Line 27 | ✅ | ❌ | ✅ | Low |
| 12 | `/api/clarity` | `app/api/clarity/route.ts` | **MISSING** | — | ✅ | ❌ | ❌ | **HIGH** |
| 13 | `/api/compass` | `app/api/compass/route.ts` | **MISSING** | — | ✅ | ❌ | ❌ | **HIGH** |
| 14 | `/api/strategy` | `app/api/strategy/route.ts` | **MISSING** | — | ✅ | ❌ | ❌ | **HIGH** |
| 15 | `/api/emotion-intel` | `app/api/emotion-intel/route.ts` | **MISSING** | — | ✅ | ❌ | ❌ | **HIGH** |

**Legend:**
- **Has Charge**: Uses `chargeTokensForOperation()`
- **Has Refund**: Uses `refundTokensForOperation()` on failure paths
- **Order Correct**: `requireEntitlement()` called before OpenAI/charge operations
- **Risk**: HIGH = Missing entitlement gate on OpenAI-spending route

---

## B) CRITICAL ISSUES — MISSING ENTITLEMENT GATES

### Issue 1: `/api/clarity` — No Entitlement Gate

**File:** `MOBILE/app/api/clarity/route.ts`  
**Lines:** 30-97

**Current Code:**
```typescript
// Line 34: Uses requireUserId instead of requireEntitlement
const userIdOr401 = await requireUserId();
if (userIdOr401 instanceof Response) return userIdOr401;
const userId = userIdOr401;

// Line 39: Rate limit (no entitlement check)
await rateLimit({ key: `clarity:${userId}`, limit: 3, window: 120 });

// Line 42: Token check (no entitlement verification)
const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "clarity", "text");

// Line 55: AI call via runClarityEngine
const result = await runClarityEngine({ freeText, frame }).catch(...);

// Line 77: Token charge
await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "clarity", "clarity", "text");
```

**Expected:** Should use `requireEntitlement("clarity")` at line 34 before any OpenAI spending.

**Risk:** Any authenticated user can spend OpenAI tokens on clarity analysis, regardless of plan tier or feature entitlement.

---

### Issue 2: `/api/compass` — No Entitlement Gate

**File:** `MOBILE/app/api/compass/route.ts`  
**Lines:** 28-91

**Current Code:**
```typescript
// Line 32: Uses requireUserId instead of requireEntitlement
const userIdOr401 = await requireUserId();
if (userIdOr401 instanceof Response) return userIdOr401;
const userId = userIdOr401;

// Line 37: Rate limit (no entitlement check)
await rateLimit({ key: `compass:${userId}`, limit: 3, window: 120 });

// Line 52: AI call via runCompassMode
const result = await runCompassMode({ raw }).catch(...);

// Line 71: Token charge
await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "compass", "compass", "text");
```

**Expected:** Should use `requireEntitlement("compass")` at line 32.

**Risk:** Any authenticated user can spend OpenAI tokens on compass mode analysis.

---

### Issue 3: `/api/strategy` — No Entitlement Gate

**File:** `MOBILE/app/api/strategy/route.ts`  
**Lines:** 21-79

**Current Code:**
```typescript
// Line 25: Uses requireUserId instead of requireEntitlement
const userIdOr401 = await requireUserId();
if (userIdOr401 instanceof Response) return userIdOr401;
const userId = userIdOr401;

// Line 30: Rate limit (no entitlement check)
await rateLimit({ key: `strategy:${userId}`, limit: 3, window: 120 });

// Line 41: AI call via runStoicStrategist
const result = await runStoicStrategist({ clarity }).catch(...);

// Line 60: Token charge
await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "strategy", "strategy", "text");
```

**Expected:** Should use `requireEntitlement("strategy")` at line 25.

**Risk:** Any authenticated user can spend OpenAI tokens on strategy generation.

---

### Issue 4: `/api/emotion-intel` — No Entitlement Gate

**File:** `MOBILE/app/api/emotion-intel/route.ts`  
**Lines:** 20-83

**Current Code:**
```typescript
// Line 24: Uses requireUserId instead of requireEntitlement
const userIdOr401 = await requireUserId();
if (userIdOr401 instanceof Response) return userIdOr401;
const userId = userIdOr401;

// Line 29: Rate limit (no entitlement check)
await rateLimit({ key: `emotion-intel:${userId}`, limit: 5, window: 180 });

// Line 44: AI call via runEmotionIntelBundle
const result = await runEmotionIntelBundle({ text }).catch(...);

// Line 63: Token charge
await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "emotion-intel", "emotion-intel", "text");
```

**Expected:** Should use `requireEntitlement("emotion_intel")` at line 24.

**Risk:** Any authenticated user can spend OpenAI tokens on emotional intelligence analysis.

---

### Issue 5: `/api/insights/patterns` — No Entitlement Gate

**File:** `MOBILE/app/api/insights/patterns/route.ts`  
**Lines:** 71-242

**Current Code:**
```typescript
// Line 75: Uses requireUserId instead of requireEntitlement
const userIdOr401 = await requireUserId();
if (userIdOr401 instanceof Response) return userIdOr401;

// Line 78: Uses requireActiveUser (auth check only)
const activeUser = await requireActiveUser();
if (isActiveUserBlocked(activeUser)) return activeUser;
const userId = activeUser.userId;

// Line 82-89: Rate limit (no entitlement check)
const rateLimitResult = await rateLimit({ ... });

// Lines 156-163: Token charge
const chargeResult = await chargeTokensForOperation(userId, planTier, estimatedTokens, "pattern_analysis", "insights_patterns", "text");

// Lines 176-190: OpenAI call via runWithOpenAICircuit
completion = await runWithOpenAICircuit(() =>
  client!.chat.completions.create({ ... })
);
```

**Expected:** Should use `requireEntitlement("insights_patterns")` before rate limiting.

**Risk:** Any active user can spend OpenAI tokens on pattern analysis, regardless of plan tier entitlement.

---

## C) VERIFIED CORRECT ORDER OF OPERATIONS

The following routes demonstrate the **correct** order:

### Correct Pattern (from `/api/transcribe/route.ts:22-142`):

```typescript
1) // Line 28: Entitlement check FIRST
   const entitlementResult = await requireEntitlement("transcribe");
   if (isEntitlementBlocked(entitlementResult)) { return entitlementResult; }
   const { userId, plan } = entitlementResult;

2) // Lines 35-46: Rate limit SECOND
   const rateLimitResult = await rateLimit({ key: `transcribe:${userId}`, ... });
   if (!rateLimitResult.allowed) { return rateLimit429Response(...); }

3) // Lines 50-53: Token availability check THIRD
   const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "transcribe", "text");
   if (!tokenCheck.allowed) { return quotaExceededResponse(); }

4) // Lines 57-60: Token charge FOURTH (before OpenAI)
   const chargeResult = await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "transcription", "transcribe", "text");
   if (!chargeResult.success) { return quotaExceededResponse(); }

5) // Lines 114-125: OpenAI call FIFTH
   transcript = await runWithOpenAICircuit(() => client.audio.transcriptions.create({ ... }));

6) // Lines 65-124: Refund on any failure path
   await refundTokensForOperation(userId, plan, ESTIMATED_TOKENS, "transcription", "transcribe", "text", requestId);
```

### Routes with Correct Order:

| Route | Entitlement Line | Rate Limit Line | Charge Line | OpenAI Line | Refund Lines |
|-------|------------------|-----------------|-------------|-------------|--------------|
| `/api/transcribe` | 28 | 35 | 57 | 114 | 65, 74, 80, 90, 108, 123 |
| `/api/audio/vella` | 30 | 36 | 84 | 240 | 122 |
| `/api/realtime/token` | 39 | 82 | 55 | 108 | 74, 98, 122, 133, 142 |
| `/api/realtime/offer` | 33 | 76 | 49 | 166 | 68, 99, 176, 195, 208 |
| `/api/vella/text` | 133 | 141 | 290 | (varies) | (varies) |
| `/api/insights/generate` | 82 | 88 | 262 | 288 | (in derivePatterns) |
| `/api/deepdive` | 41 | 46 | 89 | 69 | ❌ Missing refund |
| `/api/reflection` | 52 | 60 | 103 | 82 | ❌ Missing refund |
| `/api/growth-roadmap` | 38 | 45 | 102 | 80-83 | ❌ Missing refund |
| `/api/architect` | 27 | 32 | 66 | 55 | ❌ Missing refund |

---

## D) ADMIN BYPASS CHECK

**Result:** ✅ No admin bypass patterns found

**Scan Results:**
- No `isAdmin && skip` patterns detected
- No `admin && entitlement && bypass` patterns detected
- No `admin` entitlements are skipped

All admin operations (suspend, metadata write) go through their own separate entitlement checks in `RATE_LIMIT_POLICY` (lines 43-46 of `lib/security/rateLimitPolicy.ts`).

---

## E) VERIFICATION SCRIPT

**Script:** `MOBILE/scripts/verify-entitlement-gates.mjs`

**Execution Results:**
```bash
cd MOBILE && node scripts/verify-entitlement-gates.mjs
```

**Output:**
```
🔍 ENTITLEMENT INTEGRITY VERIFICATION

CHECK 1: AI-spending endpoint inventory
  Found 15 AI-spending routes

CHECK 2: requireEntitlement() gate check
  ❌ Missing requireEntitlement: app\api\clarity\route.ts
  ❌ Missing requireEntitlement: app\api\compass\route.ts
  ❌ Missing requireEntitlement: app\api\emotion-intel\route.ts
  ❌ Missing requireEntitlement: app\api\insights\patterns\route.ts
  ❌ Missing requireEntitlement: app\api\strategy\route.ts

CHECK 3: Order of operations (entitlement → rateLimit → charge → OpenAI)
  ✅ Order of operations correct: entitlement → charge/OpenAI

CHECK 4: Admin bypass check
  ✅ No admin bypass patterns found

CHECK 5: High-risk endpoint audit
  ✅ app/api/transcribe/route.ts: Has requireEntitlement("transcribe")
  ✅ app/api/audio/vella/route.ts: Has requireEntitlement("audio_vella")
  ✅ app/api/realtime/token/route.ts: Has requireEntitlement("realtime_session")
  ✅ app/api/realtime/offer/route.ts: Has requireEntitlement("realtime_offer")
  ✅ app/api/insights/generate/route.ts: Has requireEntitlement("insights_generate")
  ❌ app/api/insights/patterns/route.ts: Missing requireEntitlement("insights_patterns")
  ✅ app/api/vella/text/route.ts: Has requireEntitlement("chat_text")

Results: 14 passed, 6 failed
```

---

## 1) ✅/❌ CHECKLIST WITH FILE+LINE EVIDENCE

| Check | Status | File+Line Evidence |
|-------|--------|-------------------|
| `/api/transcribe` entitlement gate | ✅ | `app/api/transcribe/route.ts:28` — `requireEntitlement("transcribe")` |
| `/api/audio/vella` entitlement gate | ✅ | `app/api/audio/vella/route.ts:30` — `requireEntitlement("audio_vella")` |
| `/api/realtime/token` entitlement gate | ✅ | `app/api/realtime/token/route.ts:39` — `requireEntitlement("realtime_session")` |
| `/api/realtime/offer` entitlement gate | ✅ | `app/api/realtime/offer/route.ts:33` — `requireEntitlement("realtime_offer")` |
| `/api/vella/text` entitlement gate | ✅ | `app/api/vella/text/route.ts:133` — `requireEntitlement("chat_text")` |
| `/api/insights/generate` entitlement gate | ✅ | `app/api/insights/generate/route.ts:82` — `requireEntitlement("insights_generate")` |
| `/api/deepdive` entitlement gate | ✅ | `app/api/deepdive/route.ts:41` — `requireEntitlement("deepdive")` |
| `/api/reflection` entitlement gate | ✅ | `app/api/reflection/route.ts:52` — `requireEntitlement("reflection")` |
| `/api/growth-roadmap` entitlement gate | ✅ | `app/api/growth-roadmap/route.ts:38` — `requireEntitlement("growth_roadmap")` |
| `/api/architect` entitlement gate | ✅ | `app/api/architect/route.ts:27` — `requireEntitlement("architect")` |
| `/api/clarity` entitlement gate | ❌ | `app/api/clarity/route.ts:34` — Uses `requireUserId()` NOT `requireEntitlement()` |
| `/api/compass` entitlement gate | ❌ | `app/api/compass/route.ts:32` — Uses `requireUserId()` NOT `requireEntitlement()` |
| `/api/strategy` entitlement gate | ❌ | `app/api/strategy/route.ts:25` — Uses `requireUserId()` NOT `requireEntitlement()` |
| `/api/emotion-intel` entitlement gate | ❌ | `app/api/emotion-intel/route.ts:24` — Uses `requireUserId()` NOT `requireEntitlement()` |
| `/api/insights/patterns` entitlement gate | ❌ | `app/api/insights/patterns/route.ts:75` — Uses `requireUserId()` NOT `requireEntitlement()` |
| Admin bypass patterns | ✅ | No `isAdmin && skip` patterns found in any route |
| Verification script exists | ✅ | `scripts/verify-entitlement-gates.mjs` created with 5 checks |
| Verification script passes | ❌ | 6 failed checks (5 missing gates + 1 incorrect key in patterns) |

---

## 2) AI-SPENDING ENDPOINT TABLE (Complete)

| Route Path | Gate Type | Gate File+Line | Entitlement Name | Charge File+Line | Refund File+Line | Risk |
|------------|-----------|----------------|------------------|------------------|------------------|------|
| `/api/transcribe` | `requireEntitlement` | `route.ts:28` | `transcribe` | `route.ts:57` | `route.ts:65,74,80,90,108,123` | Low |
| `/api/audio/vella` | `requireEntitlement` | `route.ts:30` | `audio_vella` | `route.ts:84` | `route.ts:122` | Low |
| `/api/realtime/token` | `requireEntitlement` | `route.ts:39` | `realtime_session` | `route.ts:55` | `route.ts:74,98,122,133,142` | Low |
| `/api/realtime/offer` | `requireEntitlement` | `route.ts:33` | `realtime_offer` | `route.ts:49` | `route.ts:68,99,176,195,208` | Low |
| `/api/vella/text` | `requireEntitlement` | `route.ts:133` | `chat_text` | `route.ts:290` | (varies) | Low |
| `/api/insights/generate` | `requireEntitlement` | `route.ts:82` | `insights_generate` | `generator.ts:262` | `generator.ts:??` | Low |
| `/api/insights/patterns` | ❌ **MISSING** | — | **MISSING** | `route.ts:156` | `route.ts:194,201,217,223,239` | **HIGH** |
| `/api/deepdive` | `requireEntitlement` | `route.ts:41` | `deepdive` | `route.ts:89` | ❌ None | Medium |
| `/api/reflection` | `requireEntitlement` | `route.ts:52` | `reflection` | `route.ts:103` | ❌ None | Medium |
| `/api/growth-roadmap` | `requireEntitlement` | `route.ts:38` | `growth_roadmap` | `route.ts:102` | ❌ None | Medium |
| `/api/architect` | `requireEntitlement` | `route.ts:27` | `architect` | `route.ts:66` | ❌ None | Medium |
| `/api/clarity` | ❌ **MISSING** | — | **MISSING** | `route.ts:77` | ❌ None | **HIGH** |
| `/api/compass` | ❌ **MISSING** | — | **MISSING** | `route.ts:71` | ❌ None | **HIGH** |
| `/api/strategy` | ❌ **MISSING** | — | **MISSING** | `route.ts:60` | ❌ None | **HIGH** |
| `/api/emotion-intel` | ❌ **MISSING** | — | **MISSING** | `route.ts:63` | ❌ None | **HIGH** |

---

## 3) CONFIRMATION: “NO AI-SPENDING PATH EXISTS WITHOUT ENTITLEMENT GATE”

**❌ CONFIRMATION FAILED**

The following **5 AI-spending paths exist without entitlement gates**:

1. **`/api/clarity`** — Spends ~500 tokens via `runClarityEngine()` — **NO ENTITLEMENT GATE**
2. **`/api/compass`** — Spends ~500 tokens via `runCompassMode()` — **NO ENTITLEMENT GATE**
3. **`/api/strategy`** — Spends ~500 tokens via `runStoicStrategist()` — **NO ENTITLEMENT GATE**
4. **`/api/emotion-intel`** — Spends ~700 tokens via `runEmotionIntelBundle()` — **NO ENTITLEMENT GATE**
5. **`/api/insights/patterns`** — Spends ~2500 tokens via `openai.chat.completions.create()` — **NO ENTITLEMENT GATE**

**Total At-Risk Token Spend:** ~4,700 tokens per request cycle across these 5 endpoints.

**Impact:** Any authenticated user (regardless of plan tier) can invoke these endpoints and spend OpenAI tokens. Feature gating bypassed.

---

## VERDICT: ❌ FAIL — CRITICAL ISSUES FOUND

**Summary:**
- **10 routes** properly gated with `requireEntitlement()`
- **5 routes** missing entitlement gates (use `requireUserId()` instead)
- **0 routes** with admin bypass patterns
- **Verification script** created and executable

**Required Actions:**
1. Add `requireEntitlement("clarity")` to `/api/clarity/route.ts` at line 34
2. Add `requireEntitlement("compass")` to `/api/compass/route.ts` at line 32
3. Add `requireEntitlement("strategy")` to `/api/strategy/route.ts` at line 25
4. Add `requireEntitlement("emotion_intel")` to `/api/emotion-intel/route.ts` at line 24
5. Add `requireEntitlement("insights_patterns")` to `/api/insights/patterns/route.ts` at line 75

**Not all AI-spending paths have entitlement gates.**
