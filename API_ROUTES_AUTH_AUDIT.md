# API Routes Authentication Audit

**Scope:** All API route files under `app/api/**/route.ts` (Next.js App Router).  
**Criteria:** Auth requirement, JWT validation, `supabase.auth.getUser()` or equivalent, service role usage, request-before-auth, POST/PUT/DELETE without auth, `user_id` from body vs token, Stripe webhook signature and raw body.

---

## 1. Auth Helpers (Evidence)

| File | Method | Behavior |
|------|--------|----------|
| `MOBILE/lib/supabase/server-auth.ts` | `requireUserId()` | `createServerSupabaseClient()` → `supabase.auth.getUser()` (session from cookies). Returns 401 if no user. |
| `MOBILE/lib/auth/requireActiveUser.ts` | `requireActiveUser()` | Calls `requireUserId()`, then checks `admin_user_flags.suspended` and `subscriptions` via **supabaseAdmin**; returns 403 if suspended/inactive. |
| `MOBILE/lib/plans/requireEntitlement.ts` | `requireEntitlement(feature)` | Calls `requireActiveUser()`, then resolves entitlements and checks feature flag. |
| `MOBILE/lib/admin/requireAdminRole.ts` | `requireAdminRole()` | `createServerSupabaseClient()` → `supabase.auth.getUser()`; validates `app_metadata.role` in allowed list. |
| `apps/vella-control/lib/auth/requireAdmin.ts` | `requireAdmin()` | `createServerSupabaseClient()` → `supabase.auth.getUser()`; requires `user_metadata?.is_admin === true`. Dev bypass when `isAdminBypassActive()`. |

**JWT validation:** All user-facing auth uses Supabase Auth via `getUser()` (session cookie or token). No `jwt.decode()` or manual base64 parsing in these paths.

---

## 2. Stripe Webhook

| File | Route purpose | Signature verification | Raw body | Service role | Result |
|------|----------------|-----------------------|----------|-------------|--------|
| `MOBILE/app/api/stripe/webhook/route.ts` | Sync subscriptions, token top-ups, invoice events | **Yes.** Lines 102–114: `req.headers.get("stripe-signature")` required; `stripe.webhooks.constructEvent(body, signature, webhookSecret)`; 400 on invalid signature. | **Yes.** Line 107: `const body = await req.text();` — raw string passed to `constructEvent`. | Yes, after signature verification (lines 95–97, 324+). Used only after event is verified. | **PASS** |

**Exact code (signature + raw body):**
```102:114:MOBILE/app/api/stripe/webhook/route.ts
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    safeErrorLog("[stripe-webhook] signature error", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
```

---

## 3. Routes: POST/PUT/DELETE Without User Auth (Flagged)

| File | Method | Auth enforcement | Service role | Verdict | Notes |
|------|--------|------------------|--------------|---------|--------|
| `MOBILE/app/api/pattern-insight/route.ts` | POST | None (IP rate limit only, line 71–76) | No | **FAIL** | POST accepts body (patterns + language), returns localized insight. No user identity; no DB write. Still violates “POST without auth enforcement.” |
| `MOBILE/app/api/conversation/reset/route.ts` | DELETE | None (IP rate limit only, line 8–15) | No | **FAIL** | Deprecated; returns static `{ status: "reset_disabled_local_memory_only" }`; no mutation. DELETE without auth. |

---

## 4. Routes Using `user_id` from Request Body

| File | Usage | Auth before body | Verdict |
|------|--------|-------------------|---------|
| `MOBILE/app/api/internal/migration/purge/route.ts` | `body.user_id` (line 61) as target of purge | **Yes.** Lines 38–40: `isAuthorized(request)` via `MIGRATION_PURGE_CRON_SECRET` / `CRON_SECRET` in header. Body parsed only after 401 return. | **PASS** — Caller authenticated by shared secret; body specifies which user to purge. |

No user-facing route uses `user_id` from body as the identity of the caller; identity is always from `requireUserId()` / `requireActiveUser()` / `requireAdminRole()` / `requireAdmin()`.

---

## 5. Service Role Usage and Order of Checks

All listed routes below use **service role** (supabaseAdmin or `SUPABASE_SERVICE_ROLE_KEY`) **only after** user or secret auth. No route processes user-sensitive data before auth.

| File | Auth first (exact) | Service role after auth | Result |
|------|--------------------|-------------------------|--------|
| `MOBILE/app/api/feedback/create/route.ts` | Line 21: `requireUserId()` | Line 43–54: `supabaseAdmin` for insert | **PASS** |
| `MOBILE/app/api/account/delete/route.ts` | Line 13: `requireUserId()` | Lines 29–44: fromSafe/supabaseAdmin with `userId` from token | **PASS** |
| `MOBILE/app/api/account/export/route.ts` | Line 13: `requireUserId()` | Line 9+: supabaseAdmin | **PASS** |
| `MOBILE/app/api/reports/create/route.ts` | Line 21: `requireUserId()` | Line 36+: supabaseAdmin | **PASS** |
| `MOBILE/app/api/stripe/portal/route.ts` | Line 40: `requireUserId()` | Line 56+: supabaseAdmin | **PASS** |
| `MOBILE/app/api/admin/user/[id]/suspend/route.ts` | Line 19: `requireAdminRole()` | Line 43+: supabaseAdmin | **PASS** |
| `MOBILE/app/api/admin/user/[id]/metadata/route.ts` | Line 17: `requireAdminRole()` | Line 33+: supabaseAdmin, fromSafe | **PASS** |
| `MOBILE/app/api/admin/analytics/overview/route.ts` | Line 12: `requireAdminRole()` | Line 15+: supabaseAdmin | **PASS** |
| `MOBILE/app/api/admin/subscribers/route.ts` | Line 19: `requireAdminRole()` | Line 22+: supabaseAdmin | **PASS** |
| `MOBILE/app/api/internal/migration/audit/route.ts` | Line 38–40: `isAuthorized(request)` (cron secret) | Line 45+: supabaseAdmin | **PASS** |
| `MOBILE/app/api/internal/migration/purge/route.ts` | Line 38–40: `isAuthorized(request)` (cron secret) | Line 45+: supabaseAdmin | **PASS** |
| `MOBILE/app/api/stripe/webhook/route.ts` | Lines 102–114: Stripe signature verification | Line 95–97, 324+: supabaseAdmin | **PASS** |
| `apps/vella-control/app/api/admin/tokens/list/route.ts` | Line 8: `requireAdmin()` | Line 19: supabaseAdmin | **PASS** |

---

## 6. Internal / Cron / Service-Key Routes (Not User JWT)

| File | Purpose | Auth | Service role | Result |
|------|--------|------|--------------|--------|
| `MOBILE/app/api/internal/migration/audit/route.ts` | Phase M1 audit RPC | `x-cron-secret` or `Authorization: Bearer <CRON_SECRET>` (lines 22–28) | Yes | **PASS** — Secret checked before any processing. |
| `MOBILE/app/api/internal/migration/purge/route.ts` | Phase M4 purge by user_id | Same cron secret (lines 20–26) | Yes | **PASS** — Secret then body. |
| `MOBILE/app/api/internal/governance/daily/route.ts` | Daily governance cron | `GOVERNANCE_DAILY_CRON_SECRET` or `CRON_SECRET` (lines 20–25) | fromSafe (anon or service) | **PASS** — Secret checked first (GET/POST). |
| `MOBILE/app/api/sleep/rebuild/route.ts` | Rebuild sleep model | `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` + `enforceServiceKeyProtection` (lines 20–26) | No direct import; uses service key for auth. Body `userId` is target. | **PASS** |
| `MOBILE/app/api/behaviour/rebuild/route.ts` | Rebuild behaviour map | Same service key + enforceServiceKeyProtection | Same | **PASS** |
| `MOBILE/app/api/micro-rag/rebuild/route.ts` | Rebuild micro RAG cache | Same | Same | **PASS** |
| `MOBILE/app/api/social/rebuild/route.ts` | Rebuild social model | Same pattern (service key) | Same | **PASS** |
| `MOBILE/app/api/behaviour/rebuild/route.ts` | — | — | — | **PASS** |
| `MOBILE/app/api/memory/snapshot/route.ts` | Memory snapshot | Service key protection | Uses `SUPABASE_SERVICE_ROLE_KEY` for createClient | **PASS** |
| `MOBILE/app/api/memory/chunk/route.ts` | Memory chunk | Service key / auth | Service key | **PASS** |
| `MOBILE/app/api/memory/embed/route.ts` | Embed | Service key | Service key | **PASS** |
| `MOBILE/app/api/memory/reindex/route.ts` | Reindex | Service key | Service key | **PASS** |

**UNVERIFIED:** Strength and rotation of `CRON_SECRET`, `MIGRATION_AUDIT_CRON_SECRET`, `MIGRATION_PURGE_CRON_SECRET`, `GOVERNANCE_DAILY_CRON_SECRET`, and exposure of `SUPABASE_SERVICE_ROLE_KEY` to rebuild callers are not verified in this audit.

---

## 7. Public or Intentional Unauthenticated Routes

| File | Method | Auth | Purpose | Result |
|------|--------|------|---------|--------|
| `MOBILE/app/api/regulation-strategies/route.ts` | GET | IP rate limit only (line 8–13) | Static strategies list | **PASS** — Read-only, no user data. |
| `apps/vella-control/app/api/auth/login/route.ts` | POST | IP rate limit; then `signInWithPassword` | Admin login | **PASS** — Login endpoint; no auth required before attempt. |

---

## 8. Per-Route Summary Table (Representative Set)

Format: **File path** | **Route purpose** | **Auth enforcement method** | **Service role** | **PASS/FAIL/UNVERIFIED**

### MOBILE app

| File path | Route purpose | Auth enforcement method | Service role | Result |
|-----------|----------------|--------------------------|--------------|--------|
| `MOBILE/app/api/account/delete/route.ts` | Delete account and auth user | `requireUserId()` (line 13) → `getUser()` | Yes (after auth) | PASS |
| `MOBILE/app/api/account/entitlements/route.ts` | Get entitlements | `requireActiveUser()` (line 23) | No | PASS |
| `MOBILE/app/api/account/export/route.ts` | Export account data | `requireUserId()` (line 13) | Yes (after auth) | PASS |
| `MOBILE/app/api/account/plan/route.ts` | Get plan | `requireUserId()` (line 12) | No | PASS |
| `MOBILE/app/api/account/token-balance/route.ts` | Token balance | `requireActiveUser()` (line 32) | No | PASS |
| `MOBILE/app/api/checkin/contracts/route.ts` | GET/POST contracts | `requireActiveUser()` (lines 100, 278) | No | PASS |
| `MOBILE/app/api/check-ins/route.ts` | GET/POST/PATCH/DELETE check-ins | `requireUserId()` per method (56, 105, 172, 237) | No | PASS |
| `MOBILE/app/api/conversation/reset/route.ts` | DELETE (deprecated) | None; IP rate limit only | No | **FAIL** — DELETE without auth |
| `MOBILE/app/api/pattern-insight/route.ts` | POST pattern insight | IP rate limit only | No | **FAIL** — POST without auth |
| `MOBILE/app/api/stripe/webhook/route.ts` | Stripe events | Signature + raw body (lines 102–114) | Yes (after verify) | PASS |
| `MOBILE/app/api/stripe/create-checkout-session/route.ts` | Checkout session | `requireUserId()` (line 21) | No | PASS |
| `MOBILE/app/api/stripe/topups/create-checkout-session/route.ts` | Top-up checkout | `requireUserId()` (line 43) | No | PASS |
| `MOBILE/app/api/stripe/portal/route.ts` | Customer portal | `requireUserId()` (line 40) | Yes (after auth) | PASS |
| `MOBILE/app/api/stripe/token-pack/route.ts` | Token pack purchase | `requireUserId()` (line 23) | No | PASS |
| `MOBILE/app/api/realtime/offer/route.ts` | Realtime offer | `requireEntitlement("realtime_offer")` (line 32) → `requireActiveUser()` | No | PASS |
| `MOBILE/app/api/realtime/token/route.ts` | Realtime session token | `requireEntitlement("realtime_session")` (line 38) | No | PASS |
| `MOBILE/app/api/transcribe/route.ts` | Transcription | `requireEntitlement("transcribe")` (line 28) | No | PASS |
| `MOBILE/app/api/feedback/create/route.ts` | Create feedback | `requireUserId()` (line 21) | Yes (after auth) | PASS |
| `MOBILE/app/api/journal/route.ts` | GET/POST/PUT/PATCH journal | `requireUserId()` per method (28, 54, etc.) | No | PASS |
| `MOBILE/app/api/inbox/route.ts` | Inbox GET | `requireActiveUser()` (line 96) | No | PASS |
| `MOBILE/app/api/inbox/proposals/route.ts` | Proposals POST | `requireActiveUser()` (line 65) | No | PASS |
| `MOBILE/app/api/session/confirm-contract/route.ts` | Confirm contract | `requireActiveUser()` (line 60) | No | PASS |
| `MOBILE/app/api/admin/user/[id]/suspend/route.ts` | Suspend user | `requireAdminRole()` (line 19) | Yes (after auth) | PASS |
| `MOBILE/app/api/admin/user/[id]/metadata/route.ts` | Admin read user metadata | `requireAdminRole()` (line 17) | Yes (after auth) | PASS |
| `MOBILE/app/api/admin/analytics/overview/route.ts` | Admin analytics | `requireAdminRole()` (line 12) | Yes (after auth) | PASS |
| `MOBILE/app/api/admin/subscribers/route.ts` | Admin subscribers | `requireAdminRole()` (line 19) | Yes (after auth) | PASS |
| `MOBILE/app/api/internal/migration/audit/route.ts` | M1 audit cron | Cron secret header (line 38–40) | Yes (after auth) | PASS |
| `MOBILE/app/api/internal/migration/purge/route.ts` | M4 purge cron | Cron secret (line 38–40); body.user_id is target | Yes (after auth) | PASS |
| `MOBILE/app/api/internal/governance/daily/route.ts` | Daily governance | Cron secret (line 58, 76) | fromSafe | PASS |
| `MOBILE/app/api/system/health/route.ts` | System health | `requireUserId()` (line 78) | No | PASS |
| `MOBILE/app/api/memory/search/route.ts` | Memory search | `requireEntitlement("chat_text")` (line 19) | No | PASS |
| `MOBILE/app/api/distortions/route.ts` | Distortions/themes/loops | `requireUserId()` (line 16) | No | PASS |
| `MOBILE/app/api/regulation-strategies/route.ts` | Static strategies | IP rate limit only (GET) | No | PASS |
| `MOBILE/app/api/vella/text/route.ts` | Vella text | requireEntitlement (in handler) | No | PASS |
| `MOBILE/app/api/audio/vella/route.ts` | Vella audio | requireEntitlement | No | PASS |

### Vella-Control app

| File path | Route purpose | Auth enforcement method | Service role | Result |
|-----------|----------------|--------------------------|--------------|--------|
| `apps/vella-control/app/api/auth/me/route.ts` | Current admin user | `getAdminUserId()` then `supabase.auth.getUser()` (lines 9, 37–39) | No | PASS |
| `apps/vella-control/app/api/auth/login/route.ts` | Admin login | IP rate limit; signInWithPassword | No | PASS |
| `apps/vella-control/app/api/auth/logout/route.ts` | Logout | Uses getAdminUserId for rate limit | No | PASS |
| `apps/vella-control/app/api/admin/*` (all) | Admin operations | `requireAdmin()` or `getAdminUserId()` at start | supabaseAdmin where needed (after auth) | PASS |

---

## 9. Request Processed Before Auth

- **Stripe webhook:** Rate limit (77–89) and config checks (91–99) run before signature verification (102–114). Rate limit is by IP; no user data. Config checks do not use request body. **Signature is verified before any event handling or DB write.** PASS.
- **account/delete:** `if (!supabaseAdmin)` (line 9) before `requireUserId()` (line 13). No request body or user data used before auth. PASS.
- No route was found that parses JSON body or uses `user_id` from request before calling `requireUserId()` / `requireActiveUser()` / `requireAdminRole()` / `requireAdmin()` or equivalent.

---

## 10. Summary

| Category | Count | Result |
|----------|--------|--------|
| Stripe webhook | 1 | PASS (signature + raw body; service role after verify) |
| POST/PUT/DELETE without user auth | 2 | **FAIL** — `pattern-insight` (POST), `conversation/reset` (DELETE) |
| user_id from body as identity | 0 | None in user-facing routes |
| Service role before user verification | 0 | All use service role only after auth or after Stripe/cron secret |
| Request body/user data before auth | 0 | None found |
| Internal/cron/service-key routes | 10+ | PASS (secret or service key first; body.user_id only as target where applicable) |

**Recommendations:**

1. **MOBILE/app/api/pattern-insight/route.ts:** Either require user auth (e.g. `requireUserId()` or `requireEntitlement`) for POST, or document as intentionally public and accept residual risk.
2. **MOBILE/app/api/conversation/reset/route.ts:** Add `requireUserId()` (or remove the route if deprecated) so DELETE is not unauthenticated.
3. **Cron/service secrets:** Verify `CRON_SECRET`, `MIGRATION_*_CRON_SECRET`, `GOVERNANCE_DAILY_CRON_SECRET` strength and rotation; restrict `SUPABASE_SERVICE_ROLE_KEY` to server/cron only.

---

## Appendix: Auth Pattern by Route (Full Coverage)

All **145** route files fall into one of these buckets:

- **User JWT (requireUserId / requireActiveUser / requireEntitlement):** MOBILE user routes — auth via `createServerSupabaseClient()` → `supabase.auth.getUser()` (session). Service role used only after auth where needed.
- **Admin JWT (requireAdmin / requireAdminRole):** MOBILE admin routes and all vella-control `/api/admin/*` and auth/me, auth/logout — `getUser()` then admin/metadata check. Service role after auth.
- **Stripe webhook:** Signature verification then raw body; service role after verify. **PASS.**
- **Cron / internal:** `isAuthorized(request)` with `x-cron-secret` or `CRON_SECRET`; body parsed after 401 return. **PASS.**
- **Service-key rebuild/snapshot:** `enforceServiceKeyProtection` + `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`; body.userId is target. **PASS.**
- **Intentional no user auth:** `regulation-strategies` (GET, static list), `auth/login` (POST, login). **PASS.**
- **FAIL:** `pattern-insight` (POST, no auth), `conversation/reset` (DELETE, no auth).

No route uses `jwt.decode()`, `decodeJwt()`, or manual base64 for auth. No user-facing route uses `user_id` from request body as caller identity.
