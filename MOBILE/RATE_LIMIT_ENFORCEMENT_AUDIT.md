# Rate limit enforcement audit: charge/OpenAI/Stripe/transcribe/realtime routes

Routes in `MOBILE/app/api` that call **chargeTokensForOperation** or **OpenAI / Stripe / transcribe / realtime** were audited for:

1. **rateLimit()** is called  
2. **Return value enforced**: `allowed === false` → 429 (and 503 when policy is closed)  
3. **routeKey** is provided and exists in **RATE_LIMIT_POLICY**

---

## Audit table

| Route file | Method | routeKey | limit / window | Enforced (Y/N) | Verdict |
|------------|--------|----------|----------------|----------------|---------|
| `strategy/route.ts` | POST | strategy | 3 / 120s | Y | OK (fixed) |
| `vella/text/route.ts` | POST | vella_text | 5 / 60s | Y | OK (fixed) |
| `deepdive/route.ts` | POST | deepdive | 2 / 600s | Y | OK (fixed) |
| `reflection/route.ts` | POST | reflection | 5 / 300s | Y | OK (fixed) |
| `emotion-intel/route.ts` | POST | emotion_intel | 5 / 180s | Y | OK (fixed) |
| `growth-roadmap/route.ts` | POST | growth_roadmap | 2 / 300s | Y | OK (fixed) |
| `compass/route.ts` | POST | compass | 3 / 120s | Y | OK (fixed) |
| `clarity/route.ts` | POST | clarity | 3 / 120s | Y | OK (fixed) |
| `architect/route.ts` | POST | architect | 5 / 120s | Y | OK (fixed) |
| `transcribe/route.ts` | POST | transcribe | 10 / 300s | Y | OK |
| `insights/generate/route.ts` | POST | insights_generate | 5 / 300s | Y | OK |
| `insights/patterns/route.ts` | POST | insights_patterns | 5 / 300s | Y | OK |
| `audio/vella/route.ts` | POST | audio_vella | 10 / 300s | Y | OK |
| `realtime/offer/route.ts` | POST | realtime_offer | 3 / 300s | Y | OK |
| `realtime/token/route.ts` | GET | realtime_token | 2 / 60s | Y | OK |
| `stripe/webhook/route.ts` | POST | stripe_webhook | (by IP) | Y | OK |
| `stripe/create-checkout-session/route.ts` | POST | stripe_checkout | 5 / 60s | Y | OK (fixed) |
| `stripe/topups/create-checkout-session/route.ts` | POST | stripe_topup | 5 / 60s | Y | OK (fixed) |

---

## Summary

- **routeKey in RATE_LIMIT_POLICY**: All rows use a `routeKey` that exists in `MOBILE/lib/security/rateLimitPolicy.ts`.  
  **Added**: `stripe_checkout`, `stripe_topup` (both `"closed"`).
- **Enforcement**: All routes now enforce the **return value** of `rateLimit()`:  
  - `if (!rateLimitResult.allowed)` → return 429 via `rateLimit429Response(retryAfterSeconds)`  
  - If `rateLimitResult.status === 503` (closed policy, Redis down) → return 503 via `rateLimit503Response(...)`
- **Fixes applied** (surgical diffs):  
  - Replaced try/catch + `isRateLimitError(err)` with capture of `rateLimitResult` and explicit 429/503 returns in:  
    `strategy`, `vella/text`, `deepdive`, `reflection`, `emotion-intel`, `growth-roadmap`, `compass`, `clarity`, `architect`,  
    `stripe/create-checkout-session`, `stripe/topups/create-checkout-session`.  
  - Removed obsolete `isRateLimitError` handling and (where unused) imports.  
  - Stripe checkout routes now pass `routeKey` and use the same enforcement pattern.

---

## Order audit: auth → rateLimit enforced → tokenCheck → charge → external

Required order for routes that call **chargeTokensForOperation** or external APIs:  
**auth** (kill switch / requireEntitlement / requireUserId) → **rateLimit** (with 429/503 enforcement) → **tokenCheck** → **chargeTokensForOperation** → **OpenAI/Stripe/external call**.

Routes that do not use tokens (Stripe webhook, Stripe checkout): **auth** → **rateLimit** → **external** only.

| Route | auth | rateLimit enforced | tokenCheck | charge | external | Verdict |
|-------|------|--------------------|------------|--------|----------|---------|
| strategy/route.ts | 18-24 | 28-34 | 37-40 | 46-50 | 51 | PASS |
| vella/text/route.ts | 126-134 | 139-151 | 281-284 | 287-291 | 368 | PASS |
| deepdive/route.ts | 36-42 | 48-59 | 65-68 | 76-81 | 84 | PASS |
| reflection/route.ts | 50-53 | 61-68 | 82-85 | 88-92 | 97 | PASS (syntax fix L70) |
| emotion-intel/route.ts | 17-24 | 27-34 | 36-40 | 50-53 | 55 | PASS |
| growth-roadmap/route.ts | 30-39 | 46-57 | 76-79 | 83-87 | 90 | PASS |
| compass/route.ts | 25-31 | 35-41 | 44-47 | 57-61 | 63 | PASS |
| clarity/route.ts | 26-33 | 37-43 | 46-49 | 59-63 | 65 | PASS |
| architect/route.ts | 21-28 | 34-40 | 52-55 | 57-62 | 65 | PASS |
| transcribe/route.ts | 22-31 | 34-45 | 49-52 | 55-59 | 113-118 | PASS |
| insights/generate/route.ts | 77-84 | 86-99 | 164-175 (in generateInsightsServerSide) | 262-274 | after 274 | PASS |
| insights/patterns/route.ts | 70-76 | 79-92 | 146-148 (in derivePatternsForRequest) | 153-164 | 173 | PASS |
| audio/vella/route.ts | 25-31 | 34-46 | 59-62 | 82-94 | 116 | PASS |
| realtime/offer/route.ts | 27-34 | 36-48 (moved before try) | 56-58 | 63-73 | 167 | PASS (fixed) |
| realtime/token/route.ts | 34-40 | 42-54 (moved before try) | 62-64 | 69-79 | 109 | PASS (fixed) |
| stripe/webhook/route.ts | (N/A: IP) | 82-94 | — | — | 96+ | PASS |
| stripe/create-checkout-session/route.ts | 17-23 | 25-35 | — | — | 63 | PASS |
| stripe/topups/create-checkout-session/route.ts | 38-45 | 48-59 | — | — | 109 | PASS |

### Fixes applied for order violations

- **reflection/route.ts** (L70): Fixed syntax — `try { = reflectionBodySchema...` → `const parsed = reflectionBodySchema...`.
- **realtime/offer/route.ts**: Rate limit was after tokenCheck/charge. Moved rateLimit block to immediately after entitlement (before `try`), so order is auth → rateLimit → tokenCheck → charge → external.
- **realtime/token/route.ts**: Same as offer — rateLimit moved to right after entitlement, before tokenCheck/charge.

---

*Generated after scanning MOBILE/app/api for chargeTokensForOperation and OpenAI/Stripe/transcribe/realtime usage.*
