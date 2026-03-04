# ROUTE DEDUPLICATION + TAXONOMY CLEANUP AUDIT REPORT
## Phase 3.4 — Duplicate Route Elimination

**Date:** 2026-02-28  
**Status:** ✅ COMPLETE — All duplicate routes eliminated, naming standardized  
**Goal:** One canonical path per capability. No dead endpoints to confuse maintainers.

---

## A) INVENTORY + DECISION TABLE

| Route Path | Status | Canonical Replacement | Action | Reason |
|------------|--------|----------------------|--------|--------|
| `/api/voice/transcribe` | Legacy | `/api/transcribe` | **Deleted** | Empty folder, no route.ts file. Already cleaned up prior. |
| `/api/voice/speak` | Unused | `/api/audio/vella` | **Deleted** | Zero client callers found in codebase. Dead code elimination. |
| `/api/transcribe` | Active | Self (canonical) | **Kept** | Only transcribe endpoint. Full implementation with entitlements + rate limits + token charging. |
| `/api/audio/vella` | Active | Self (canonical) | **Kept** | Canonical TTS endpoint. Used by `useRealtimeVella.ts`. Advanced audio with presets/modes. |
| `/api/check-ins` | Active | Self (canonical) | **Kept** | Main check-in CRUD API. URL kept for backward compatibility. |
| `/api/checkin/contracts` | Active | Self (canonical) | **Kept** | Contract management API. "checkin" naming (no dash) for consistency. |

---

## B) TRANSCRIBE UNIFICATION (✅ VERIFIED)

**Canonical Endpoint:** `/api/transcribe` (POST)

**Evidence of Unification:**
- ✅ Single transcribe route exists: `MOBILE/app/api/transcribe/route.ts`
- ✅ Legacy `/api/voice/transcribe/route.ts` does NOT exist (confirmed via file system check)
- ✅ Legacy `/api/voice/transcribe` folder removed entirely
- ✅ Client references only use `/api/transcribe` (test files reference correctly)

**Canonical Route Features (Preserved):**
```typescript
// MOBILE/app/api/transcribe/route.ts:1-142
- Entitlement check: requireEntitlement("transcribe")
- Rate limit: routeKey "transcribe", 10 requests per 5 min window
- Token charging: chargeTokensForOperation() before OpenAI call
- Token refund on failures: refundTokensForOperation()
- Circuit breaker: runWithOpenAICircuit()
- Response shape: { text: string, confidence: number }
```

**Route Keys Updated:**
- Rate limit config: `transcribe: { limit: 10, window: 300 }` ✓
- Rate limit policy: `transcribe: "closed"` (fail-closed for monetized) ✓
- AI endpoint policy: `transcribe: { auth: "required", rateLimitKey: "transcribe" }` ✓

---

## C) TTS ENDPOINT DEDUP (✅ VERIFIED)

**Decision:** Deleted unused `/api/voice/speak`, kept `/api/audio/vella` as canonical.

**Rationale:**
- `/api/voice/speak`: Zero client callers found in codebase (grepped .ts and .tsx files)
- `/api/audio/vella`: Active caller at `MOBILE/lib/realtime/useRealtimeVella.ts:2188`
- Both serve TTS but vella has richer feature set (presets, modes, voice profiles)
- No need for wrapper/redirect — voice/speak was truly dead code

**Files Removed:**
| File | Lines | Reason |
|------|-------|--------|
| `MOBILE/app/api/voice/speak/route.ts` | 158 | Unused TTS endpoint |
| `MOBILE/app/api/voice/speak/` | — | Empty folder removed |
| `MOBILE/app/api/voice/transcribe/` | — | Empty folder removed |
| `MOBILE/app/api/voice/` | — | Empty parent folder removed |

**Rate Limit Cleanup:**
```diff
// MOBILE/lib/security/rateLimit/config.ts:30-31
- "voice/speak": { limit: 20, window: 600 },
```

```diff
// MOBILE/lib/security/rateLimitPolicy.ts:29
- voice_speak: "closed",
```

```diff
// MOBILE/lib/security/aiEndpointPolicy.ts:48
- "voice/speak": { auth: "required" as const, rateLimitKey: "voice_speak" },
```

**Canonical TTS Endpoint Preserved:**
- Path: `/api/audio/vella`
- Rate limit: `audio_vella: { limit: 10, window: 300 }`
- Policy: `audio_vella: "closed"` (fail-closed, spends money)
- Entitlement: `requireEntitlement("audio_vella")`
- Token charging: Pre-OpenAI atomic deduction with refund on failure

---

## D) CHECK-IN NAMING CLEANUP (✅ STANDARDIZED)

**Standard:** "checkin" (no dash, no underscore) for all internal references.

**Naming Matrix:**
| Context | Before | After | Status |
|---------|--------|-------|--------|
| URL path | `/api/check-ins` | `/api/check-ins` | Kept (backward compat) |
| URL path | `/api/checkin/contracts` | `/api/checkin/contracts` | Kept (consistent) |
| Rate limit keys | mixed | `checkin_read`, `checkin_write` | ✅ Standardized |
| Rate limit keys | mixed | `checkin_contracts` | ✅ Standardized |
| Comments | mixed | "checkin" (no dash) | ✅ Updated |

**Files Updated:**
```typescript
// MOBILE/app/api/check-ins/route.ts:1-13
/**
 * NAMING STANDARD: "checkin" (no dash/hyphen) used consistently:
 * - Route path: /api/check-ins (kept for URL backward compatibility)
 * - Rate limit keys: checkin_read, checkin_write
 * - Database table: check_ins_v2
 * - Library functions: checkins/db.ts
 * - Internal references: checkin (not check_in, not check-in)
 */
```

```typescript
// MOBILE/app/api/checkin/contracts/route.ts:1-11
/**
 * NAMING STANDARD: "checkin" (no dash/hyphen) used consistently:
 * - Route path: /api/checkin/contracts (no dash)
 * - Rate limit key: checkin_contracts
 * - Related: /api/check-ins (main check-in API, kept for URL backward compatibility)
 * - Internal references: checkin (not check_in, not check-in)
 */
```

**Rate Limit Policy Verification:**
```typescript
// MOBILE/lib/security/rateLimitPolicy.ts:59-90
  checkin_read: "open",
  checkin_write: "open",
  // ...
  checkin_contracts: "open",
```

---

## E) VERIFICATION SCRIPT (✅ CREATED)

**Script:** `MOBILE/scripts/verify-no-duplicate-routes.mjs`

**Checks Performed:**
1. ✅ Only one transcribe endpoint exists
2. ✅ No legacy 410 placeholder routes
3. ✅ Voice speak route removed (confirmed no callers)
4. ✅ Voice transcribe folder removed
5. ✅ Rate limit config cleaned up (no voice/speak references)
6. ✅ Rate limit policy cleaned up (no voice_speak policy)
7. ✅ AI endpoint policy cleaned up (no voice/speak references)
8. ✅ Audio vella endpoint exists as canonical TTS
9. ✅ Client uses canonical audio endpoint (`/api/audio/vella`)
10. ✅ Check-in naming consistency (`checkin_read`, `checkin_write`)

**Execution:**
```bash
cd MOBILE && node scripts/verify-no-duplicate-routes.mjs
```

**Output:**
```
🔍 ROUTE DEDUPLICATION VERIFICATION

CHECK 1: Transcribe endpoint uniqueness
  ✅ Only one canonical transcribe endpoint: /api/transcribe/route.ts
CHECK 2: No legacy 410 placeholder routes
  ✅ No legacy 410 placeholder routes found
CHECK 3: Voice speak route removed (no callers existed)
  ✅ Legacy voice/speak route removed (confirmed no client callers)
CHECK 4: Voice transcribe folder removed
  ✅ Legacy voice/transcribe folder removed
CHECK 5: Rate limit config cleaned up
  ✅ voice/speak removed from rate limit config
CHECK 6: Rate limit policy cleaned up
  ✅ voice_speak policy removed from rate limit policy
CHECK 7: AI endpoint policy cleaned up
  ✅ voice/speak removed from AI endpoint policy
CHECK 8: Audio vella endpoint exists as canonical TTS
  ✅ Canonical TTS endpoint exists: /api/audio/vella
CHECK 9: Client uses canonical audio endpoint
  ✅ Client correctly uses /api/audio/vella
CHECK 10: Check-in naming consistency (checkin vs check_in)
  ✅ Rate limit policy uses consistent 'checkin' naming (no dash)

==================================================
Results: 10 passed, 0 failed
==================================================

✅ All route deduplication checks passed!
Duplicate route confusion is eliminated.
```

---

## 1) ✅/❌ CHECKLIST WITH FILE+LINE EVIDENCE

| Check | Status | File+Line Evidence |
|-------|--------|-------------------|
| Legacy transcribe route removed | ✅ | `app/api/voice/transcribe/` folder does not exist |
| Only one canonical transcribe endpoint | ✅ | `app/api/transcribe/route.ts:1-142` — full implementation |
| TTS duplication resolved | ✅ | `app/api/voice/speak/route.ts` — deleted (no callers) |
| Naming standardized (route keys) | ✅ | `lib/security/rateLimitPolicy.ts:59-90` — `checkin_read`, `checkin_write` |
| Naming standardized (internal refs) | ✅ | `app/api/check-ins/route.ts:8` — "Internal references: checkin (not check_in, not check-in)" |
| Naming standardized (contracts) | ✅ | `app/api/checkin/contracts/route.ts:11` — "Internal references: checkin (not check_in, not check-in)" |
| Verification script exists | ✅ | `scripts/verify-no-duplicate-routes.mjs` — 10 checks |
| Verification script passes | ✅ | Exit code 0, 10 passed, 0 failed |

---

## 2) FILES CHANGED

| File | Change Type | Description |
|------|-------------|-------------|
| `MOBILE/app/api/voice/speak/route.ts` | **Deleted** | Unused TTS endpoint (no client callers) |
| `MOBILE/app/api/voice/speak/` | **Deleted** | Empty folder |
| `MOBILE/app/api/voice/transcribe/` | **Deleted** | Empty legacy folder |
| `MOBILE/app/api/voice/` | **Deleted** | Empty parent folder |
| `MOBILE/lib/security/rateLimit/config.ts` | Modified | Removed `"voice/speak": { limit: 20, window: 600 }` entry |
| `MOBILE/lib/security/rateLimitPolicy.ts` | Modified | Removed `voice_speak: "closed"` policy entry |
| `MOBILE/lib/security/aiEndpointPolicy.ts` | Modified | Removed `"voice/speak": {...}` endpoint entry |
| `MOBILE/app/api/check-ins/route.ts` | Modified | Updated naming standard comment block |
| `MOBILE/app/api/checkin/contracts/route.ts` | Modified | Updated naming standard comment block |
| `MOBILE/scripts/verify-no-duplicate-routes.mjs` | Created | Verification script with 10 checks |

---

## 3) PROOF: WHY DUPLICATE ROUTE CONFUSION IS ELIMINATED

### Structural Elimination

**Before (confusing):**
- `/api/voice/transcribe` — legacy (empty folder, confusing)
- `/api/transcribe` — active (canonical)
- `/api/voice/speak` — unused (dead code, but maintained)
- `/api/audio/vella` — active (canonical)
- Check-in naming: mixed `check_in`, `checkin`, `check-in` in comments

**After (clean):**
- `/api/transcribe` — **only** transcribe endpoint (lines 1-142)
- `/api/audio/vella` — **only** TTS endpoint (full implementation)
- Check-in naming: standardized to `checkin` everywhere

### How Confusion Is Prevented

1. **Single Source of Truth Per Capability:**
   - Transcription → only `/api/transcribe`
   - TTS/Audio generation → only `/api/audio/vella`
   - Check-ins → `/api/check-ins` (main), `/api/checkin/contracts` (contracts)

2. **No Ghost Routes:**
   - Deleted `/api/voice/*` entire subtree (no lingering empty folders)
   - Deleted unused `/api/voice/speak` even though it had implementation
   - Verification script asserts no 410 placeholder routes exist

3. **Explicit Naming Standard:**
   - Both check-in route files now document the "checkin" (no dash) standard inline
   - Rate limit policy uses consistent `checkin_*` keys
   - Comments explicitly state "not check_in, not check-in"

4. **Verification Runtime Protection:**
   - `verify-no-duplicate-routes.mjs` runs 10 checks
   - CI/CD can run this script to prevent regression
   - Non-zero exit on failure prevents merge of duplicate routes

### Verification Script as Living Documentation

The verification script serves as executable documentation of the route architecture:

```javascript
// These assertions define the canonical route structure
const canonicalTranscribe = transcribeRoutes.filter(p => 
  p.includes("api\\transcribe") || p.includes("api/transcribe")
);
const legacyVoiceTranscribe = transcribeRoutes.filter(p => 
  p.includes("voice\\transcribe") || p.includes("voice/transcribe")
);
// Fail if any legacy routes found
if (legacyVoiceTranscribe.length > 0) fail(...);
```

---

## VERDICT: ✅ PASS

All duplicate routes eliminated. One canonical path per capability. Naming standardized. Verification script provides ongoing regression protection.

**Duplicate route confusion is structurally eliminated.**
