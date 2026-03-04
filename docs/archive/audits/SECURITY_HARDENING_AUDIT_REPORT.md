# Security & Hardening Audit Report — Vela Mobile & Vela Control

**Mode:** STRICT READ-ONLY · REPORT ONLY  
**Authority:** RELEASE-BLOCKING  
**Scope:** Vela Mobile App (MOBILE), Vela Control (apps/vella-control), shared backend, API routes, middleware  
**Date:** 2025-02-10 (updated)  

---

## Executive Summary

| Item | Status |
|------|--------|
| **Overall status** | **CONDITIONAL** |
| **High-risk findings** | **0** (no critical release-blockers in current code) |
| **Critical gaps** | **None** (previous criticals have been addressed in codebase) |
| **Can ship to production as-is?** | **Conditional** — depends on risk acceptance for remaining medium/low items |

The codebase has been hardened: high-value and destructive MOBILE routes are rate limited and token-protected; Vella Control admin and auth routes are rate limited; vella/text and growth-roadmap have quota checks and charging; Stripe webhook and portal are correctly scoped; emotion-memory uses server-derived userId only. Remaining gaps are moderate (unbounded input on a few schemas, SDP length, routes without rate limits) and low (in-memory rate limit store, circuit breaker scope, key rotation not documented). No hard-coded secrets or client-side OpenAI usage was found.

---

## Findings Table

| Severity | Area | File / Path | Description | Risk |
|----------|------|-------------|-------------|------|
| **Medium** | Input validation | `MOBILE/app/api/reports/create/route.ts` | `bodySchema`: `type`, `severity`, `summary` have `.min(1)` but no `.max()`. | Unbounded string length; DoS and storage abuse. |
| **Medium** | Input validation | `MOBILE/app/api/feedback/create/route.ts` | `category` has `.min(1)`, `message` optional; no `.max()` on either. | Unbounded length; DoS and storage. |
| **Medium** | Input validation | `MOBILE/app/api/realtime/offer/route.ts` | `sdp` taken from body as string with no length limit and sent to OpenAI. | Unbounded payload; DoS and cost amplification. |
| **Medium** | Rate limiting | MOBILE: read and utility routes | No rate limiting on: patterns, progress, connection-depth, connection-index, life-themes, strengths-values, journal-themes, cognitive-distortions, prediction, themes, loops, distortions, weekly-review, nudge, behaviour-loops, regulation, identity, deep-insights, traits, forecast, roadmap, emotion-memory, conversation/reset, pattern-insight, voice/transcribe. Rebuild/snapshot routes are service-key protected but not rate limited. | Abuse and DoS on read/utility paths; rebuild routes could be hammered if key leaked. |
| **Medium** | Input validation | Multiple MOBILE API routes | Body parsed with type cast or minimal checks (no Zod) on: architect, strategy (clarity normalized ad-hoc), compass, emotion-intel, deepdive, audio/vella, voice/speak, goals (POST/PATCH ad-hoc), stripe/portal (returnPath allowlist only), emotion-memory (samples type guard, no array length cap). | Type confusion, unexpected fields, no length caps. |
| **Low** | Production readiness | MOBILE: rate limit store | Without `REDIS_URL`, `MemoryRateLimitStore` is used. Per-instance only; not shared across replicas. | With multiple instances, effective limits are N× per instance. |
| **Low** | Production readiness | Vella Control: rate limit | `apps/vella-control/lib/security/rateLimit.ts` uses in-memory `Map` only; no Redis option. | Same as above for admin surface. |
| **Low** | Production readiness | MOBILE: circuit breaker | Circuit breaker is in-memory only (single process). | Multi-instance deployments each have their own circuit state. |
| **Low** | Dev endpoint | `MOBILE/app/api/dev/token-dry-run/route.ts` | Protected only by `NODE_ENV === "production"`; no authentication in development. | In dev, any client can call; acceptable if dev surface is not exposed. |
| **Low** | Secrets / config | Codebase | No hard-coded API keys or tokens in production code. `scripts/smoke/helpers.mjs` uses placeholder `OPENAI_API_KEY: "sk-test-placeholder"` for test env only. Secrets from `process.env`; service-role key used only server-side. Key rotation strategy not documented. | No evidence of key leakage; rotation not documented. |
| **Low** | Logging | MOBILE | No evidence of logging raw secrets. Some routes log "missing OPENAI_API_KEY" or error context without key value. | Low risk of secret leakage via logs. |

---

## 1. Rate Limiting & Abuse Control

### Enforced (evidence found)

- **MOBILE — User-based (post-auth):**  
  architect (5/120s), journal POST/PUT/PATCH (30/60s), account/export (5/300s), account/delete (2/600s), stripe/portal (5/60s), stripe/create-checkout-session (5/60s), stripe/token-pack (5/60s), feedback/create (10/60s), reports/create (10/60s), goals POST/PATCH (20/60s), growth-roadmap (2/300s), vella/text (5/60s), audio/vella, reflection, insights/generate, insights/patterns, transcribe, strategy, compass, emotion-intel, deepdive, clarity, realtime/token, realtime/offer, voice/speak — all call `rateLimit()` with per-user keys and return `rateLimit429Response` on `RateLimitError`.
- **MOBILE — IP-based:**  
  Stripe webhook: `webhook:stripe:${clientIp}` (100/60s).
- **Vella Control:**  
  Login: IP-based `ip:auth:login:${ip}` (5/300s). All admin API routes and auth/me, auth/logout: `rateLimitAdmin(request, routeName, userId)` (30/60s per admin or IP fallback). Key prefix `admin:${userId}:${routeName}` or `admin:ip:${ip}:${routeName}`.
- **429 handling:**  
  Where used, `rateLimit429Response(retryAfterSeconds)` returns stable JSON and optional `Retry-After`; no stack or internal details in response.

### Missing or partial

- **MOBILE — No rate limiting:**  
  patterns, progress, connection-depth, connection-index, life-themes, strengths-values, journal-themes, cognitive-distortions, prediction, themes, loops, distortions, weekly-review, nudge, behaviour-loops, regulation, identity, deep-insights, traits, forecast, roadmap, emotion-memory, conversation/reset, pattern-insight, voice/transcribe; rebuild and snapshot routes (service-key protected). Journal GET (read) has no rate limit.
- **MOBILE — Rebuild routes:**  
  sleep/rebuild, social/rebuild, behaviour/rebuild, micro-rag/rebuild, memory/snapshot authorize via `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`; no rate limit. If key leaked, endpoints could be hammered.

### Graceful 429

- Where rate limiting is used, 429 is returned via the shared helper; no crashes or stack leaks observed in response.

---

## 2. Input Validation & Sanitization (Zero Trust)

### Schema-based validation (Zod) present

- **MOBILE:**  
  vella/text (`vellaTextRequestSchema`), growth-roadmap (`growthRoadmapRequestSchema`), insights/patterns, insights/generate, journal (create/update/retry), clarity, stripe token-pack and create-checkout-session, reports/create, feedback/create, pattern-insight. Several schemas use `.strict()` and length caps (e.g. journal 10k chars, vella text message 4000, growth roadmap persona bounded).
- **Vella Control:**  
  Login: `adminLoginSchema.safeParse(body)`. Admin mutation routes use body schemas (e.g. `bodySchema.parse(await request.json())`).

### Endpoints accepting unchecked or loosely checked body

- **Unbounded strings in schema:**  
  reports/create (type, severity, summary); feedback/create (category, message).
- **Type-asserted or ad-hoc only:**  
  architect (`request.json().catch(() => ({}))`), strategy (body cast; clarity normalized), compass, emotion-intel, deepdive, audio/vella, realtime/offer (sdp string, no length limit), voice/speak, goals (POST/PATCH ad-hoc), stripe/portal (returnPath allowlist), emotion-memory (samples type guard, no array length cap).

### Injection

- No SQL/NoSQL construction from raw user input observed; Supabase client used with parameters. Prompt injection and log poisoning not fully traced; AI prompts include user content — risk is implicit.

---

## 3. API Keys, Secrets & Environmental Hygiene

- **Hard-coded keys/tokens:** None in production code. `scripts/smoke/helpers.mjs` sets `OPENAI_API_KEY: "sk-test-placeholder"` for test env only.
- **Secrets source:** Sensitive keys from `process.env` (OPENAI_API_KEY, STRIPE_*, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, etc.).
- **Client exposure:** Service-role key and webhook secret used only server-side. No evidence of server-only secrets in client bundles.
- **Separation:** Public vars (e.g. NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL) vs private (OPENAI_API_KEY, STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY) is clear.
- **Key rotation:** No documented key rotation strategy in codebase.
- **Stripe webhook:** Signature verified with `stripe.webhooks.constructEvent(body, signature, webhookSecret)`; body read as raw text. Correct.

---

## 4. OWASP Top 10 Compliance (Conceptual)

- **Broken access control:** Auth enforced per-route via `requireUserId()` / `requireAdmin()`. Emotion-memory and stripe/portal bind operations to authenticated user only (server-derived userId; portal resolves customer from storage by userId). No IDOR observed. Admin bypass gated by NODE_ENV, explicit flag, and host check; production hard-blocked.
- **Auth bypass risks:** Admin bypass cannot activate when NODE_ENV=production. Localhost check on server uses HOSTNAME/HOST; empty string treated as localhost in devBypass — misconfiguration could allow bypass if NODE_ENV=development and bypass flags set on non-local host.
- **Excessive data exposure:** account/export returns user-scoped data only (userId from session). No obvious over-exposure in responses.
- **Insecure deserialization:** JSON parsed with standard APIs; no untrusted deserialization of custom formats. Type casts without schema increase risk of unexpected shapes.
- **Security misconfiguration:** Dev bypass and NODE_ENV checks present. Missing rate limits and input caps on some routes are configuration/omission risks.
- **Logging of sensitive data:** No logging of passwords, tokens, or API keys. Some error context logged without values.
- **Dependencies:** Not scanned.

---

## 5. OpenAI / Credit Leakage & Cost Abuse

### Verified protections

- **Token enforcement:** checkTokenAvailability + chargeTokensForOperation used on: vella/text, growth-roadmap, architect, audio/vella, reflection, insights/generate, insights/patterns, transcribe, strategy, compass, emotion-intel, deepdive, clarity, realtime/token, realtime/offer, voice/speak. Quota checked before OpenAI call; charge after success (or after non-fallback result for growth-roadmap).
- **Rate limiting (user):** Same AI routes have per-user rate limits.
- **Circuit breaker:** Used on voice/speak and agents path; in-memory only.
- **Timeouts:** textEngine.ts uses explicit timeout 60_000 ms. Shared client in lib/ai/client.ts has 60s timeout. fetchWithTimeout used on audio/vella, realtime/token, realtime/offer, voice/speak.
- **Server-only:** All OpenAI usage is server-side; no client-side OpenAI calls found.

### Gaps

- **Request deduplication:** Not observed; idempotency present for Stripe webhook (event id) only.
- **User/workspace scoping:** Token usage and quotas are per-user (userId from session). One user cannot charge another’s quota; protection is in place at API boundary.

---

## 6. Production Readiness & Load Survivability

- **Blocking operations:** No synchronous blocking in request paths observed. DB and OpenAI calls are async. In-memory rate limit and circuit breaker use in-process state.
- **Timeouts:** OpenAI-facing routes use fetchWithTimeout or client timeout (15–30s for realtime/audio, 60s for text). textEngine has 60s.
- **Unbounded queues:** No application-level queues observed; no explicit backpressure.
- **Global state:** Rate limit store (memory or Redis in MOBILE; memory only in vella-control) and circuit breaker state are global per process. Memory store not shared across instances.
- **Circuit breakers:** Present for OpenAI; single-process only.
- **Error handling:** Routes catch and return 4xx/5xx without leaking stack. Consistent helpers used.

**Verdict:** System can handle moderate concurrency. Under hundreds of concurrent users, per-instance rate limits and circuit state may under-protect if multiple instances are used; Redis for rate limiting (MOBILE supports REDIS_URL) would improve survivability. No evidence of panic-style crashes or uncaught throws in hot paths.

---

## 7. Critical Gaps (Release-Blocking)

**None.** Previous criticals have been addressed in the current codebase:

- **emotion-memory:** Uses `requireUserId()` and writes with server-derived `userId` only; no client-supplied userId.
- **stripe/portal:** Resolves `stripe_customer_id` from storage by authenticated `userId`; does not use client-supplied customer ID.
- **vella/text and growth-roadmap:** Both have checkTokenAvailability, chargeTokensForOperation, rate limiting, and (vella/text) schema validation.
- **architect:** Has token check, charge, and rate limiting.
- **High-value/destructive routes:** Rate limiting added on architect, journal, account/export, account/delete, stripe/portal, create-checkout-session, token-pack, feedback, reports, goals; admin surface fully rate limited.

---

## 8. Non-Blocking Observations

- Add `.max()` to reports/create and feedback/create schema fields to bound length.
- Add length limit to realtime/offer `sdp` before sending to OpenAI.
- Consider rate limiting remaining MOBILE read/utility routes (patterns, progress, emotion-memory, etc.) and rebuild routes (per-key or per-IP).
- Document key rotation for OPENAI_API_KEY, STRIPE_*, SUPABASE_SERVICE_ROLE_KEY.
- For multi-instance production, use Redis for rate limiting (MOBILE supports REDIS_URL); vella-control has no Redis option.
- Tighten dev bypass: require explicit HOSTNAME=localhost on server so empty string does not enable bypass.
- Validate admin query params (e.g. logs/list `since`, content-library/get `id`) with schema or allowlist.

---

## 9. Final Verdict

**Can this ship to production as-is?** **Conditional yes.**

**Reason:** No critical or high-risk release-blocking issues were found in the current code. Access control is correctly enforced on sensitive endpoints; high-cost and destructive routes are rate limited and (where applicable) token-protected; vella/text and growth-roadmap have quota checks and charging; Stripe webhook and portal are correctly implemented; secrets are not hard-coded or exposed to the client. Remaining findings are medium (unbounded input on a few endpoints, SDP length, routes without rate limits) and low (in-memory rate limit store, circuit breaker scope, key rotation not documented). Shipping is acceptable if these residual risks are accepted or scheduled for remediation; otherwise address the medium items before release.
