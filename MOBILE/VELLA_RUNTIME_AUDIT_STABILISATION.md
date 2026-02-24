# Vella Runtime Audit & Stabilisation

**Mode:** Controlled modification  
**Goal:** Fix build errors caused by Edge runtime using Node-only modules.

---

## STEP 1 — Offending Files (Node-only imports)

| File | Import | Runtime Declared? | Used In API Route? |
|------|--------|-------------------|--------------------|
| `lib/security/observability.ts` | `crypto` (createHash) | N/A (lib) | Indirect via rateLimit → all routes using rateLimit |
| `lib/security/serviceKeyProtection.ts` | `crypto` (createHash) | N/A (lib) | Only if route uses service key protection |
| `lib/local/serverLocal.ts` | `fs` | N/A (lib) | Server-only; not used in API route handlers directly |
| `lib/insights/generatePersonaInsights.ts` | `crypto` (randomUUID) | N/A (lib) | Used by insights/generate (server) |
| `lib/security/rateLimit.ts` | (observability → crypto); dynamic `ioredis` (stream/dns/net/tls) | N/A (lib) | **All routes that import rateLimit** |

**Note:** No direct imports of `stream`, `dns`, `net`, `tls`, `http`, `https`, or `child_process` in application code; `ioredis` (loaded dynamically by rateLimit when REDIS_URL is set) brings in Node-only modules.

---

## STEP 2 — API Routes: Runtime Declaration

| Route | Runtime Declared? | Should Be Node? |
|-------|-------------------|-----------------|
| `api/stripe/portal` | Yes (`nodejs`) | Yes |
| `api/stripe/webhook` | Yes (`nodejs`) | Yes |
| `api/stripe/create-checkout-session` | Yes (`nodejs`) | Yes |
| `api/stripe/token-pack` | Yes (`nodejs`) | Yes |
| `api/voice/transcribe` | Yes (`nodejs`) | Yes (was Edge; fixed) |
| `api/voice/speak` | Yes (`nodejs`) | Yes |
| `api/transcribe` | Yes (`nodejs`) | Yes |
| `api/audio/vella` | Yes (`nodejs`) | Yes |
| All other `app/api/**/route.ts` | No (default) | Yes if they import rateLimit/OpenAI/Stripe/Redis/crypto/transcribe |

In Next 14 App Router, API routes **default to Node.js** unless `runtime = "edge"` is set. No API route in this app sets `edge`; the only one that had been set to Edge (`api/voice/transcribe`) was changed to `nodejs` to avoid loading `rateLimit` (and thus `observability`/crypto) on Edge.

---

## STEP 3 — Fix Strategy Applied

- **`api/voice/transcribe`:** Changed `export const runtime = "edge"` → `export const runtime = "nodejs"` (it imports rateLimit, which uses Node-only modules).
- **Other Node-dependent routes** that already had `runtime = "nodejs"`: stripe (portal, webhook, create-checkout-session, token-pack), voice/speak, transcribe, audio/vella.
- No route that is safe for Edge was forced to Node; no route is set to Edge.

---

## rateLimit Runtime Safety

- **Node-only imports:**  
  - Direct: `observability` (which uses `crypto`).  
  - Conditional: `ioredis` (stream, dns, net, tls, etc.) when `REDIS_URL` is set.
- **Safe for Edge?** **No.** Any route that imports `@/lib/security/rateLimit` must run in Node.
- **Used by which routes:**  
  All of: account/delete, account/export, account/plan, architect, audio/vella, behaviour-loops, behaviour/rebuild, clarity, cognitive-distortions, compass, conversation/reset, connection-depth, connection-index, deep-insights, deepdive, distortions, emotion-intel, emotion-memory, feedback/create, forecast, goals, growth-roadmap, insights/generate, insights/patterns, journal, journal-themes, life-themes, loops, memory/snapshot, micro-rag/rebuild, nudge, pattern-insight, patterns, prediction, progress, roadmap, regulation, regulation-strategies, reports/create, social/rebuild, sleep/rebuild, strategy, stripe/*, themes, traits, transcribe, vella/text, voice/speak, voice/transcribe, weekly-review; plus dev/token-dry-run and realtime/offer, realtime/token.

**Conclusion:** All of these routes must run in Node (default for API routes in this app; the only explicit Edge route was voice/transcribe, which was corrected).

---

## STEP 5 — Build Status

### BUILD STATUS

- **Build Success:** Yes  
- **Edge errors remaining:** None  
- **Node runtime applied to:**  
  - Explicitly set to `nodejs`: stripe/portal, stripe/webhook, stripe/create-checkout-session, stripe/token-pack, voice/transcribe, voice/speak, transcribe, audio/vella.  
  - All other API routes use default (Node.js); none use Edge.

### Additional fixes applied during stabilisation

- **Stripe portal:** Typed subscription row as `{ stripe_customer_id?: string \| null }` to fix `row` inferred as `never`.
- **i18n:** Added `nav.journal` and `nav.insights` to dictionaries: es, ar, ja, pt, fr (Phase 1 nav had added these to en and types only).
- **Circuit breaker:** `memoryStore.ts` — use `open` from `CircuitBreakerState` instead of `isOpen`.
- **usageServer.ts:** Type assertion for `fromSafe("token_usage").insert()` and typed `data` for `getServerUsageForUser` (Supabase client inference).
- **webhook_events:** Added table to `lib/supabase/types.ts` and `safeTables.ts`; webhookIdempotency insert cast for same inference issue.
- **validationSchemas.ts:** `z.record(z.unknown())` → `z.record(z.string(), z.unknown())`; `z.enum(..., { errorMap: ... })` → `z.enum(..., { message: ... })`.
- **rateLimit.ts:** Production REDIS_URL check moved from import-time to first use of store (`getStore()`) so `next build` (which loads API routes) does not throw when REDIS_URL is unset.

---

## Completion criteria

- Build passes.
- No runtime mismatch (no Edge route uses Node-only modules).
- Node-dependent routes that were explicitly Edge (voice/transcribe) are now Node; other Node-dependent routes either declare `nodejs` or use default Node.
- No accidental Edge execution of Node-only code.

You can proceed to Phase 2.
