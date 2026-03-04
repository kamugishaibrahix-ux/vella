# vella-control: Routes Using requireAdmin() / getAdminUserId()

Every route in `apps/vella-control` that uses **requireAdmin()** and/or **getAdminUserId()**, with behavior, data access, admin DB usage, and CRITICAL flag where the route can mutate DB, billing, users, flags, or tokens.

**Admin client:** All admin routes that touch the database use **getAdminClient()** from `@/lib/supabase/adminClient` (or **supabaseAdmin** from `@/lib/supabase/admin`, which is the same). That client is created with **SUPABASE_SERVICE_ROLE_KEY** — i.e. **service role / admin DB access** for all routes that perform DB operations below.

---

## Auth routes (getAdminUserId only)

| File path | What it does | Data access | Service role / admin DB | CRITICAL? |
|-----------|----------------|-------------|--------------------------|-----------|
| `apps/vella-control/app/api/auth/me/route.ts` | GET: current admin user for session check | Session only: `getUser()` via anon server client; no admin tables | No | No |
| `apps/vella-control/app/api/auth/logout/route.ts` | POST: sign out | Session only: `signOut()`; no admin tables | No | No |

---

## Read-only admin routes (requireAdmin + getAdminUserId)

| File path | What it does | Data access | Service role / admin DB | CRITICAL? |
|-----------|----------------|-------------|--------------------------|-----------|
| `apps/vella-control/app/api/admin/users/list/route.ts` | GET: list all users (user_metadata) | `user_metadata` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/feedback/list/route.ts` | GET: list feedback | `feedback` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/subscriptions/list/route.ts` | GET: list subscriptions | `subscriptions` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/alerts/route.ts` | GET: recent system alerts | `system_logs` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/alert-rules/route.ts` | GET: list alert rules | `admin_ai_config` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/insights/overview/route.ts` | GET: dashboard counts (users, subs, tokens, feedback, logs) | `user_metadata`, `subscriptions`, `token_usage`, `feedback`, `admin_activity_log`, `system_logs` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/config/get/route.ts` | GET: admin AI config | `admin_ai_config` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/promo-codes/list/route.ts` | GET: list promo codes | `promo_codes` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/system-health/route.ts` | GET: health / recent logs | `system_logs`, `analytics_counters` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/analytics/get/route.ts` | GET: analytics counters | `analytics_counters`, `system_logs` (select); fromSafe() | Yes — getAdminClient() / supabaseAdmin | No |
| `apps/vella-control/app/api/admin/reports/list/route.ts` | GET: list user reports | `user_reports` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/revenue/route.ts` | GET: revenue / MRR from subscriptions | `subscriptions` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/user-reports/list/route.ts` | GET: list user reports | `user_reports` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/tokens/list/route.ts` | GET: list token usage | `token_usage` (select) | Yes — supabaseAdmin | No |
| `apps/vella-control/app/api/admin/system-settings/get/route.ts` | GET: system settings | `admin_ai_config` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/engagement/route.ts` | GET: engagement metrics | `token_usage`, `feedback`, `system_logs` (select) | Yes — getAdminClient() | No |
| `apps/vella-control/app/api/admin/logs/list/route.ts` | GET: system + admin activity logs | `system_logs`, `admin_activity_log` (select) | Yes — getAdminClient() | No |

---

## Mutation routes — CRITICAL

### Users (user_metadata, flags)

| File path | What it does | Data access | Service role / admin DB | CRITICAL? |
|-----------|----------------|-------------|--------------------------|-----------|
| `apps/vella-control/app/api/admin/users/update-plan/route.ts` | POST: set user plan (user_metadata.plan + subscriptions) | `user_metadata` (update), `subscriptions` (read/update), `admin_activity_log` (insert) | Yes | **CRITICAL** — users, billing/plan |
| `apps/vella-control/app/api/admin/users/update-status/route.ts` | POST: set user status | `user_metadata` (update), `admin_activity_log` (insert) | Yes | **CRITICAL** — users |
| `apps/vella-control/app/api/admin/users/update-tokens/route.ts` | POST: adjust user token balance | `user_metadata` (update token_balance), `token_ledger` (insert), `admin_activity_log` (insert) | Yes | **CRITICAL** — tokens |
| `apps/vella-control/app/api/admin/users/update-notes/route.ts` | POST: set admin notes on user | `user_metadata` (update notes), `admin_activity_log` (insert) | Yes | **CRITICAL** — users |
| `apps/vella-control/app/api/admin/users/update-voice/route.ts` | POST: toggle voice enabled | `user_metadata` (update voice_enabled), `admin_activity_log` (insert) | Yes | **CRITICAL** — users |
| `apps/vella-control/app/api/admin/users/update-realtime/route.ts` | POST: toggle realtime beta | `user_metadata` (update realtime_beta), `admin_activity_log` (insert) | Yes | **CRITICAL** — users |
| `apps/vella-control/app/api/admin/users/update-shadow-ban/route.ts` | POST: set shadow ban | `user_metadata` (update shadow_ban), `admin_activity_log` (insert) | Yes | **CRITICAL** — users, flags |
| `apps/vella-control/app/api/admin/users/update-flagged/route.ts` | POST: set flagged for review | `user_metadata` (update flagged_for_review), `admin_activity_log` (insert) | Yes | **CRITICAL** — flags |
| `apps/vella-control/app/api/admin/users/flag-review/route.ts` | POST: set flag for review | `user_metadata` (update flagged_for_review), `admin_activity_log` (insert) | Yes | **CRITICAL** — flags |

### Billing / subscriptions

| File path | What it does | Data access | Service role / admin DB | CRITICAL? |
|-----------|----------------|-------------|--------------------------|-----------|
| `apps/vella-control/app/api/admin/subscriptions/update-plan/route.ts` | POST: change subscription plan | `subscriptions` (update), `admin_activity_log` (insert) | Yes | **CRITICAL** — billing |
| `apps/vella-control/app/api/admin/subscriptions/update-status/route.ts` | POST: change subscription status | `subscriptions` (update), `admin_activity_log` (insert) | Yes | **CRITICAL** — billing |
| `apps/vella-control/app/api/admin/subscriptions/bulk-recalculate/route.ts` | POST: recalc token balances from subscriptions | `subscriptions` (select), `user_metadata` (update token_balance, tokens_per_month), `admin_activity_log` (insert) | Yes | **CRITICAL** — tokens, billing |
| `apps/vella-control/app/api/admin/subscriptions/sync-stripe/route.ts` | POST: Stripe sync | None (returns 501 Not Implemented) | No | No |

### Promo codes / billing

| File path | What it does | Data access | Service role / admin DB | CRITICAL? |
|-----------|----------------|-------------|--------------------------|-----------|
| `apps/vella-control/app/api/admin/promo-codes/create/route.ts` | POST: create promo code | `promo_codes` (insert), `admin_activity_log` (insert) | Yes | **CRITICAL** — billing |
| `apps/vella-control/app/api/admin/promo-codes/update/route.ts` | POST: update promo code | `promo_codes` (update), `admin_activity_log` (insert) | Yes | **CRITICAL** — billing |
| `apps/vella-control/app/api/admin/promo-codes/deactivate/route.ts` | POST: deactivate promo code | `promo_codes` (update is_active), `admin_activity_log` (insert) | Yes | **CRITICAL** — billing |
| `apps/vella-control/app/api/admin/promo-codes/delete/route.ts` | POST: soft-delete promo code | `promo_codes` (update is_active), `admin_activity_log` (insert) | Yes | **CRITICAL** — billing |

### Config / system (DB mutation)

| File path | What it does | Data access | Service role / admin DB | CRITICAL? |
|-----------|----------------|-------------|--------------------------|-----------|
| `apps/vella-control/app/api/admin/config/save/route.ts` | POST: save admin AI config | `admin_ai_config` (update/upsert, deactivate others), `admin_activity_log` (insert) | Yes | **CRITICAL** — DB (system config) |
| `apps/vella-control/app/api/admin/system-settings/save/route.ts` | POST: save system settings | `admin_ai_config` (update/upsert), `admin_activity_log` (insert) | Yes | **CRITICAL** — DB (system config) |
| `apps/vella-control/app/api/admin/alert-rules/save/route.ts` | POST: save alert rule | `admin_ai_config` (insert/update, deactivate others), `admin_activity_log` (insert) | Yes | **CRITICAL** — DB (alert config) |

### Reports (DB mutation)

| File path | What it does | Data access | Service role / admin DB | CRITICAL? |
|-----------|----------------|-------------|--------------------------|-----------|
| `apps/vella-control/app/api/admin/user-reports/create/route.ts` | POST: create user report | `user_reports` (insert), `admin_activity_log` (insert) | Yes | **CRITICAL** — DB |
| `apps/vella-control/app/api/admin/user-reports/update/route.ts` | POST: update user report | `user_reports` (update), `admin_activity_log` (insert) | Yes | **CRITICAL** — DB |
| `apps/vella-control/app/api/admin/reports/update/route.ts` | POST: update report | `user_reports` (update), `admin_activity_log` (insert) | Yes | **CRITICAL** — DB |

---

## Summary counts

| Category | Count |
|----------|--------|
| Routes using requireAdmin() and/or getAdminUserId() | 38 |
| Auth only (getAdminUserId), no admin DB | 2 (auth/me, auth/logout) |
| Read-only admin (no mutation) | 17 |
| Mutation (CRITICAL) | 19 |
| Stub (sync-stripe, 501) | 1 (no DB) |

**All mutation routes use getAdminClient() (service role).** If admin auth were bypassed or spoofed (e.g. via app_metadata.role), an attacker could mutate users, billing, flags, tokens, and system config via these endpoints.
