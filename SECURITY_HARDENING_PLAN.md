# Security Hardening Plan

**Purpose:** Establish safety rails before full hardening. Document phases, verification steps, and regression checks.

**Reference:** `VELA_SECURITY_PRODUCTION_AUDIT_REPORT.md` (if present)

---

## Phases Overview

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Safety rails (this phase) | In progress |
| 1 | Rate limiting enforcement | See Phase 1 |
| 2 | Token enforcement (enable real caps) | See Phase 2 |
| 3 | Unauthenticated endpoint protection | See Phase 3 |
| 4 | Input validation & sanitization | See Phase 4 |
| 5 | Secrets hygiene & env hardening | See Phase 5 |
| 6 | Load survivability | See Phase 6 |

---

## Phase 0: Safety Rails (Current)

**Goal:** Fix critical bugs that neutralize existing protections. No business logic changes.

### Changes

| Item | What Changed | File(s) |
|------|--------------|---------|
| Rate limit bypass | Removed `.catch(() => {})` that swallowed `RateLimitError`. Rate limit now propagates; routes return 429 when exceeded. | `MOBILE/app/api/voice/speak/route.ts`, `MOBILE/app/api/realtime/token/route.ts`, `MOBILE/app/api/clarity/route.ts` |
| Admin bypass in prod | Multi-layered protection: `isAdminBypassActive()` requires NODE_ENV=development AND ADMIN_BYPASS_LOCAL_ONLY=1 AND localhost. Hard fail-safe logs warning and forces OFF in production. No env values logged. | `apps/vella-control/lib/auth/devBypass.ts` |
| .env exclusion | Added root `.gitignore` with `.env`, `.env.local`, `.env.*.local` to prevent accidental commit of secrets. | `.gitignore` (repo root) |

### Verification

```bash
# Rate limiting returns 429 (not swallowed)
cd MOBILE && pnpm exec vitest run test/security/rateLimit.test.ts

# Admin bypass never active in production
cd apps/vella-control && NODE_ENV=production pnpm exec vitest run test/security/devBypass.test.ts

# .env not tracked
git status  # .env.local should appear as ignored if present
```

---

## Phase 1: Rate Limiting Enforcement

**Goal:** Ensure all AI-consuming and sensitive endpoints have effective rate limiting.

### What Changed

- **Distributed store:** `lib/security/rateLimit.ts` uses `RateLimitStore` abstraction. When `REDIS_URL` is set, Redis is used (persists across instances). Otherwise in-memory for local dev.
- **IP and user limiting:** `rateLimitByIp(req, routeKey, limit, window)` for pre-auth endpoints; `rateLimitByUser(userId, routeKey, limit, window)` or `rateLimit({ key, limit, window })` for post-auth.
- **Config:** `RATE_LIMIT_CONFIG` in `lib/security/rateLimit/config.ts` defines presets per route class.

### Rate Limit Thresholds (per route)

| Route Class | Key | Limit | Window | Notes |
|-------------|-----|-------|--------|-------|
| **Public AI** (pre-auth) | `ip:publicAI:${ip}` | 5 burst / 20 sustained | 60s / 600s | Use for unauthenticated AI endpoints |
| **Auth AI** (post-auth) | `user:*:${userId}` | 30 | 600s | Default for authenticated AI |
| **Auth login** | `ip:login:${ip}` | 10 | 300s | Strict IP for sign-in/signup |
| **Auth login** | per identifier | 5 | 300s | Per email/phone to prevent brute force |
| **clarity** | `clarity:${userId}` | 3 | 120s | Stoic clarity engine |
| **strategy** | `strategy:${userId}` | 3 | 120s | Stoic strategist |
| **compass** | `compass:${userId}` | 3 | 120s | Compass mode |
| **emotion-intel** | `emotion-intel:${userId}` | 5 | 180s | Emotion analysis |
| **deepdive** | `deepdive:${userId}` | 2 | 600s | Deep dive (expensive) |
| **voice/speak** | `voice_speak:${userId}` | 20 | 600s | TTS |
| **realtime/token** | `realtime_token:${userId}` | 2 | 60s | Session creation |
| **realtime/offer** | `realtime_offer:${userId}` | 3 | 300s | WebRTC offer |
| **insights/patterns** | `insights_patterns:${userId}` | 5 | 300s | Emotional patterns |
| **insights/generate** | `insights_generate:${userId}` | 5 | 300s | Insight generation |
| **reflection** | `reflection:${userId}` | 5 | 300s | Reflection API |
| **audio/vella** | `audio_vella:${userId}` | 10 | 300s | Vella audio |

### AI Endpoint Policy Alignment

**Source of truth:** `MOBILE/lib/security/aiEndpointPolicy.ts` defines `AI_ENDPOINTS` with a `rateLimitKey` for each AI-consuming route.

**Alignment (verified):** Every route listed in `AI_ENDPOINTS` now calls `rateLimit()` with the documented key before performing any AI or expensive work. No mismatch between policy and implementation.

| Policy route | rateLimitKey | Implementation |
|--------------|--------------|-----------------|
| clarity | clarity | `rateLimit({ key: \`clarity:${userId}\`, ... })` |
| strategy | strategy | `rateLimit({ key: \`strategy:${userId}\`, ... })` |
| compass | compass | `rateLimit({ key: \`compass:${userId}\`, ... })` |
| emotion-intel | emotion-intel | `rateLimit({ key: \`emotion-intel:${userId}\`, ... })` |
| deepdive | deepdive | `rateLimit({ key: \`deepdive:${userId}\`, ... })` |
| transcribe | transcribe | `rateLimit({ key: \`transcribe:${userId}\`, ... })` |
| insights/patterns | insights_patterns | `rateLimit({ key: \`insights_patterns:${userId}\`, ... })` |
| insights/generate | insights_generate | `rateLimit({ key: \`insights_generate:${userId}\`, ... })` |
| reflection | reflection | `rateLimit({ key: \`reflection:${userId}\`, ... })` |
| audio/vella | audio_vella | `rateLimit({ key: \`audio_vella:${userId}\`, ... })` |
| voice/speak | voice_speak | `rateLimit({ key: \`voice_speak:${userId}\`, ... })` |
| realtime/token | realtime_token | `rateLimit({ key: \`realtime_token:${userId}\`, ... })` |
| realtime/offer | realtime_offer | `rateLimit({ key: \`realtime_offer:${userId}\`, ... })` |

When adding a new AI endpoint, add it to `AI_ENDPOINTS` in `aiEndpointPolicy.ts` with a `rateLimitKey`, add preset to `RATE_LIMIT_CONFIG.routes` in `lib/security/rateLimit/config.ts`, and call `rateLimit()` at the start of the handler using that key.

### Production Setup (Required)

**MOBILE**

- **`REDIS_URL` is required in production.** Set it in your production environment (e.g. `redis://localhost:6379` or a managed Redis URL). If `NODE_ENV=production` and `REDIS_URL` is missing, the app will throw when the rate limit module is first loaded. In development, `REDIS_URL` is optional; when unset, the in-memory store is used (dev only).
- At startup, the rate limit module logs once: `RateLimitStore=Redis` or `RateLimitStore=Memory (dev only)`.

**Vella Control (admin surface)**

- **`ADMIN_REDIS_URL` or `REDIS_URL` is required in production.** Set one of them in production (e.g. `redis://localhost:6379`). If `NODE_ENV=production` and neither is set, the app will throw when the rate limit module is first loaded. In development, both are optional; when unset, the in-memory store is used (dev only).
- Rate limit store abstraction matches MOBILE: `RateLimitStore` with atomic `consume(key, windowMs, max)`. Implementations: `MemoryRateLimitStore` (dev) and `RedisRateLimitStore` (production). Key shapes unchanged: `admin:${userId}:${routeName}`, `admin:ip:${ip}:${routeName}`, `ip:auth:login:${ip}`.
- At startup, the module logs once: `RateLimitStore=Redis` or `RateLimitStore=Memory (dev only)`.

**Service-key protected routes (rebuild/snapshot)**

- Rebuild and snapshot routes (`sleep/rebuild`, `social/rebuild`, `behaviour/rebuild`, `micro-rag/rebuild`, `memory/snapshot`) use `lib/security/serviceKeyProtection.ts`: Bearer service-key auth is unchanged; in addition, rate limiting is applied **per IP** and **per auth header fingerprint** (SHA-256 hash, never stored or logged). Optional IP allowlist: set `SERVICE_KEY_ALLOWED_IPS="1.2.3.4,5.6.7.8"` (comma-separated); if set, requests from other IPs receive 403. Request body is capped at 2048 bytes for JSON. No raw service key is ever logged or persisted.

### Verification

- Security regression checklist: "rate limiting returns 429 (not swallowed)".
- Load test: exceed limit, confirm 429 response.
- With `REDIS_URL` (MOBILE) or `ADMIN_REDIS_URL`/`REDIS_URL` (vella-control) set: limits persist across multiple app instances.

---

## Phase 2: Token Enforcement

**Goal:** Enable real token caps; block requests when limits exceeded.

### What Changed

- **Real blocking:** `checkTokenAvailability` returns `allowed: false` when over quota; routes return 402.
- **Durable storage:** Usage persisted to Supabase `token_usage` (user_id, source, tokens, from_allocation only — no prompts or content).
- **Fail closed:** When Supabase unavailable, all token checks deny.
- **Per-channel limits:** Text tokens, realtime voice seconds, audio clips enforced from `PLAN_LIMITS` (tierLimits.ts).
- **Quota response:** `quotaExceededResponse()` returns 402 with `{ code: "QUOTA_EXCEEDED", message: "..." }`.
- **All AI routes:** clarity, strategy, compass, emotion-intel, deepdive, transcribe, voice/speak, realtime/token, realtime/offer, insights/patterns, insights/generate, reflection, audio/vella — check before AI, charge after success.

### Verification

- Security regression checklist: "token enforcement blocks when exceeded".
- `pnpm test test/tokens/quotaExceeded.test.ts`

---

## Phase 3: Unauthenticated Endpoint Protection

**Goal:** Block or strictly limit unauthenticated AI endpoints.

### What Changed

- **Real auth implemented:** `requireUserId()` and `getOptionalUserId()` in `lib/supabase/server-auth.ts` now use Supabase server session (cookies). No more hard-coded "local-user".
- **All AI endpoints require auth:** See `lib/security/aiEndpointPolicy.ts`. No public AI routes — all consume OpenAI only when authenticated.
- **Consistent error shapes:** 401 `{ code: "UNAUTHORIZED", error: "unauthorized", message }`, 429 `{ code: "RATE_LIMITED", message }`, 402 `{ code: "QUOTA_EXCEEDED", message }`.
- **Transcribe hardened:** Auth required, rate limit (10/5min), file size limit (25MB), content-type allowlist (mp3, mp4, webm, wav, m4a).
- **Explicitly public (non-AI):** Stripe webhook uses signature verification. Rebuild routes use Bearer service key.

### Verification

- Security regression checklist: "unauth endpoints blocked or strictly limited".
- Run `pnpm vitest run test/security/` — serverAuth tests verify 401 shape.

---

## Phase 4: Input Validation & Sanitization

**Goal:** Schema-based validation on all user inputs; reject extra fields; length limits.

### What Changed

- **Validation schemas:** Created `lib/security/validationSchemas.ts` with strict Zod schemas for all high-impact routes.
- **Validation error response:** Created `lib/security/validationErrors.ts` for consistent 400 `{ code: "VALIDATION_ERROR", message }` responses.
- **Routes updated:** Applied validation to clarity, journal (POST/PUT/PATCH), insights/patterns, insights/generate, stripe checkout, stripe token-pack.
- **Unknown field rejection:** All schemas use `.strict()` to reject unexpected fields.
- **Length limits enforced:**
  - Clarity: `freeText` max 1000 chars
  - Journal: `text` max 10000 chars, `title` max 200 chars
  - Insights: check-ins max 100 entries, notes max 500 chars, pattern arrays max 20 items with strings max 100 chars
  - Stripe: email max 255 chars
- **Consistent error handling:** Routes return `validationErrorResponse()` on schema parse failure, immediately stopping execution.

### Validation Schema Summary

| Route | Schema | Key Constraints |
|-------|--------|-----------------|
| `POST /api/clarity` | `clarityRequestSchema` | freeText: 1-1000 chars; rejects unknown fields |
| `POST /api/journal` | `journalCreateSchema` | text: 1-10000 chars, title: 0-200 chars; rejects unknown |
| `PUT /api/journal` | `journalUpdateSchema` | id required, text: 1-10000 chars; rejects unknown |
| `PATCH /api/journal` | `journalRetryEnrichmentSchema` | id required; rejects unknown |
| `POST /api/insights/patterns` | `insightsPatternRequestSchema` | checkins max 100, mood/stress/energy/focus: 0-10, note max 500 chars; rejects unknown |
| `POST /api/insights/generate` | `insightsGenerateRequestSchema` | checkins max 100, patterns arrays max 20 items; rejects unknown |
| `POST /api/stripe/create-checkout-session` | `stripeCheckoutSessionSchema` | plan enum: "pro" or "elite"; rejects unknown |
| `POST /api/stripe/token-pack` | `stripeTokenPackSchema` | packId enum: "pack_small", "pack_medium", "pack_large"; rejects unknown |

### Verification

```bash
# Unit tests for validation schemas
pnpm vitest run test/security/validationSchemas.test.ts

# Integration tests for API routes
pnpm vitest run test/api/validationIntegration.test.ts
```

- Security regression checklist: "oversized messages rejected", "unknown fields rejected".
- Fuzz tests with oversized and malformed payloads confirm 400 responses with `VALIDATION_ERROR` code.

---

## Phase 5: Secrets Hygiene

**Goal:** No secrets in repo; clear public vs private env separation; rotation strategy.

### What Will Change

- Confirm `.gitignore` excludes `.env*`; add pre-commit hook or CI check.
- Document required env vars; mark public vs private.
- Remove or gate `VELLA_BYPASS_ADMIN_AUTH` from production configs.

### What Changed (Phase 0 Hardening)

**Admin Bypass Hardening:**
- Migrated from single-variable `VELLA_BYPASS_ADMIN_AUTH` to multi-layer protection
- New variable: `ADMIN_BYPASS_LOCAL_ONLY=1` (clearer intent)
- Bypass now requires ALL of:
  1. `NODE_ENV=development` (exactly, not "staging" or other)
  2. `ADMIN_BYPASS_LOCAL_ONLY=1` (or legacy `VELLA_BYPASS_ADMIN_AUTH=1`)
  3. Host is localhost/127.0.0.1
- Hard fail-safe: In production, logs warning (without leaking env values) and forces bypass OFF
- Legacy flag still supported for backward compatibility

### Verification

- Security regression checklist: ".env files not committed".
- `git log -p -- '*.env*'` returns nothing.
- Admin bypass test: 7 test cases covering production block, multi-layer security, localhost check.

---

## Phase 6: Load Survivability

**Goal:** Handle hundreds of concurrent users without breaking.

### What Changed

- **Distributed rate limiting:** Implemented via `REDIS_URL` + ioredis. See Phase 1.
- **Distributed circuit breaker for OpenAI:** `MOBILE/lib/ai/circuitBreaker.ts` uses a store abstraction; when `REDIS_URL` is set, state is Redis-backed (shared across instances). When failures in a sliding window exceed the threshold, the circuit opens and all instances fail fast with 503 for the cooldown. **Thresholds (safe defaults):** 5 failures in 1 minute → open for 30s. See `OPENAI_CIRCUIT_CONFIG` and `lib/ai/circuitBreaker/store.ts`. Memory store used when Redis is not configured (dev). Caller behaviour unchanged: `runWithOpenAICircuit(fn)` and `isCircuitOpenError(err)` unchanged; 503 when circuit is open.

### What Will Change

- Add timeouts to OpenAI and DB calls (where not already present).
- Consistent error handling (avoid 200 for errors).

---

## Pre-Commit: Secrets Hygiene Check

Before committing, run the secrets hygiene script to ensure no hard-coded secrets are in tracked files:

```bash
node scripts/check_secrets_hygiene.mjs
```

- Scans all tracked files for patterns like `OPENAI_API_KEY=`, `SUPABASE_SERVICE_ROLE_KEY=`, `STRIPE_SECRET_KEY=`, etc.
- Excludes `node_modules`, `.next`, `dist`, `build`, `out`.
- Fails with a clear message and exit code 1 if any matches are found.
- Does NOT print secret values.

Consider adding this to a pre-commit hook or CI pipeline.

---

## Security Regression Checklist

Run before each release. All items must pass.

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | Rate limiting returns 429 (not swallowed) | Hit rate limit on `voice/speak`, `realtime/token`, or `clarity`; response must be HTTP 429 with error body. |
| 2 | Unauth endpoints blocked or strictly limited | `vella/text`, `transcribe` must require auth or have strict IP/user rate limits before production. |
| 3 | Token enforcement blocks when exceeded | When token cap exceeded, AI routes return 403 or 429; no OpenAI call made. |
| 4 | Admin auth bypass cannot activate in production | With `NODE_ENV=production`, `isAdminBypassActive()` returns `false` regardless of any env vars. Hard fail-safe logs warning without leaking values. Bypass requires: NODE_ENV=development + ADMIN_BYPASS_LOCAL_ONLY=1 + localhost. |
| 5 | .env files not committed | `git ls-files | grep -E '\.env'` returns nothing; `.gitignore` includes `.env`, `.env.local`, `.env.*.local`. |

---

## Lightweight Test Strategy

**Principle:** Minimal tests for high-risk paths only. Full test suite is out of scope for this plan.

### High-Risk Areas

| Area | Test Type | Scope |
|------|-----------|-------|
| Rate limiting | Unit | `rateLimit()` throws `RateLimitError` when limit exceeded; no swallow. |
| Admin bypass | Unit | `isAdminBypassActive()` returns `false` when `NODE_ENV=production` OR when not on localhost OR when flags not set. Multi-layer security verified. |
| Token enforcement | Unit (when enabled) | `checkTokenAvailability` returns `allowed: false` when over limit. |

### Test Locations

- `MOBILE/test/security/rateLimit.test.ts` — rate limit behavior
- `apps/vella-control/test/security/devBypass.test.ts` — admin bypass guard

### Not in Scope

- Integration tests for full request flow
- Load or chaos testing
- Dependency vulnerability scanning

---

## Files Touched (Phase 0)

| File | Change |
|------|--------|
| `SECURITY_HARDENING_PLAN.md` | Created (this file) |
| `.gitignore` | Created at repo root; excludes `.env*` |
| `MOBILE/app/api/voice/speak/route.ts` | Removed `.catch(() => {})` on `rateLimit` |
| `MOBILE/app/api/realtime/token/route.ts` | Removed `.catch(() => {})` on `rateLimit` |
| `MOBILE/app/api/clarity/route.ts` | Removed `.catch(() => {})`; added `RateLimitError` handling in catch |
| `apps/vella-control/lib/auth/devBypass.ts` | Hard guard: always `false` when `NODE_ENV=production` |
| `MOBILE/test/security/rateLimit.test.ts` | New minimal test |
| `apps/vella-control/test/security/devBypass.test.ts` | New minimal test |
| `apps/vella-control/package.json` | Added vitest, test scripts |
| `apps/vella-control/vitest.config.ts` | New config for tests |
