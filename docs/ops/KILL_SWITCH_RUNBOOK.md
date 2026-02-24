# Kill Switch Runbook

Emergency env-controlled switches to stop billing, AI, or all writes without a code deploy. Used for active exploit, billing bugs, or AI runaway cost.

---

## What each switch does

| Env var | Effect |
|--------|--------|
| **APP_MAINTENANCE_MODE** | When `"true"`: middleware returns **503 Maintenance** for all requests except allowed paths (webhook, admin, login, static). No app or AI; Stripe webhook still runs. |
| **DISABLE_BILLING** | When `"true"`: create-checkout-session, token-pack, and portal return **503** with `{ code: "BILLING_DISABLED", message: "Billing is temporarily disabled" }`. **Stripe webhook is NOT blocked** so subscription events continue to sync. |
| **DISABLE_AI** | When `"true"`: all routes that call OpenAI (vella/text, deepdive, architect, strategy, compass, emotion-intel, clarity, growth-roadmap, audio/vella, insights/generate, insights/patterns, transcribe, realtime/offer, realtime/token, voice/speak, journal POST/PUT/PATCH) return **503** with `{ error: "ai_unavailable", message: "AI is temporarily disabled" }`. |
| **WRITE_LOCK_MODE** | When `"true"`: all Supabase writes through `safeInsert` / `safeUpdate` / `safeUpsert` throw unless the caller passes **bypassWriteLock** (used only by the Stripe webhook and, in vella-control, admin routes). Global write freeze for the app; webhook and admin can still write. |

All switches are **off** when the env var is unset or not exactly `"true"` (case-sensitive).

---

## When to use each

- **APP_MAINTENANCE_MODE** — Site-wide outage or incident; you want to show “Maintenance” and only allow webhook + admin + login + static.
- **DISABLE_BILLING** — Billing bug or pricing mistake; stop new checkouts and portal/token-pack without breaking Stripe event sync.
- **DISABLE_AI** — AI runaway cost, abuse, or model issue; stop all OpenAI usage immediately.
- **WRITE_LOCK_MODE** — Suspected data corruption or abuse via writes; freeze all app writes while keeping webhook (and admin) writes so subscriptions and admin actions still work.

---

## Order of activation

### Active exploit (e.g. abuse or breach)

1. **APP_MAINTENANCE_MODE=true** — Take the app down to a minimal allowlist (webhook, admin, login, static).
2. Optionally **WRITE_LOCK_MODE=true** if you want to freeze all app writes while keeping webhook/admin.
3. Fix and redeploy; then clear both.

### Billing bug (wrong charge, duplicate, etc.)

1. **DISABLE_BILLING=true** — Stops new checkouts and portal/token-pack; webhook keeps subscription state in sync.
2. Fix pricing or logic; redeploy; set **DISABLE_BILLING** back to unset or `"false"`.

### AI runaway cost or abuse

1. **DISABLE_AI=true** — All OpenAI-backed routes return 503 immediately.
2. Optionally **APP_MAINTENANCE_MODE=true** if you want full maintenance.
3. Fix (quota, abuse, model); redeploy; clear env vars.

---

## How to revert safely

1. In Vercel (or your host): Project → Settings → Environment Variables.
2. Remove the kill switch var or set it to something other than `"true"` (e.g. leave unset or set to `"false"`).
3. Redeploy or wait for env refresh (per host docs).
4. Run the [Smoke test checklist](#smoke-test-checklist) below.

Do **not** revert until the underlying issue is fixed and deployed; otherwise the same problem will reappear.

---

## Smoke test checklist

After **activating** a kill switch (to confirm it worked):

- [ ] **Maintenance:** Request to `/` or any non-allowed path returns **503** and body “Maintenance”. Request to `/api/stripe/webhook` (with valid Stripe signature) is **not** 503.
- [ ] **Billing disabled:** POST to create-checkout-session or token-pack or portal returns **503** with `code: "BILLING_DISABLED"`. Webhook still processes (e.g. send test event from Stripe Dashboard).
- [ ] **AI disabled:** POST to `/api/vella/text` (or any AI route) returns **503** with `error: "ai_unavailable"`.
- [ ] **Write lock:** Any app write (e.g. journal create) fails with write-lock error; webhook still updates subscriptions.

After **reverting** a kill switch:

- [ ] **Auth** — Login and session work.
- [ ] **Billing** — Checkout and portal load; no 503 on billing routes.
- [ ] **Webhook** — Send a test Stripe event; confirm it’s processed (e.g. subscription or token balance updated).
- [ ] **Rate limiting** — Confirm 429 when exceeding limits where applicable.
- [ ] **Critical path** — One full user flow (e.g. open app → one AI action or key screen) completes without 503.

---

## Allowed routes during maintenance (APP_MAINTENANCE_MODE=true)

- `/api/stripe/webhook` — So Stripe subscription and payment events keep syncing.
- `/api/admin` (and under) — Admin operations.
- `/login` — Login page.
- `/_next`, `/favicon.ico`, `/assets` — Static assets.

Everything else returns **503 Maintenance**.

---

## Related

- [ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md) — Code and data rollback (Vercel + Supabase).
- [MIGRATION_POLICY.md](./MIGRATION_POLICY.md) — Safe migrations and runbook SQL.
