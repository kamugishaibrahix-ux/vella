# SECURITY DEFINER functions vs 20260246_tighten_service_role_grants

**Scope:** Four SECURITY DEFINER functions in `supabase/migrations` that are executable only by `service_role`.  
**Reference:** `MOBILE/supabase/migrations/20260246_tighten_service_role_grants.sql` (tightens `service_role` on `public.subscriptions`, `public.user_metadata`, `public.webhook_events` only).

**Principle:** With SECURITY DEFINER, the function body runs with the **owner** role’s privileges, not the caller’s. So table privileges required are those of the **function owner**, not of `service_role`. Only EXECUTE is granted to `service_role`; the caller does not need table grants for the function’s internal INSERT/UPDATE.

---

## 1. Function owner role

Migrations do **not** set `OWNER` on these functions. The owner is therefore the role that runs the migration (e.g. `postgres` or the Supabase project owner), **not** `service_role`.

| Function | Owner (inferred) | Notes |
|----------|-------------------|--------|
| atomic_token_deduct | postgres (migration runner) | No OWNER in SQL |
| atomic_token_refund | postgres (migration runner) | No OWNER in SQL |
| atomic_stripe_webhook_process | postgres (migration runner) | No OWNER in SQL |
| atomic_stripe_event_record | postgres (migration runner) | No OWNER in SQL |

---

## 2. Required INSERT/UPDATE after 20260246

**20260246** only changes **service_role** grants on:

- `public.subscriptions` → REVOKE ALL, then GRANT SELECT, INSERT, UPDATE, DELETE  
- `public.user_metadata` → REVOKE ALL, then GRANT SELECT, INSERT, UPDATE, DELETE  
- `public.webhook_events` → REVOKE ALL, then GRANT SELECT, INSERT (no UPDATE/DELETE)

It does **not** change grants on `token_usage` or `token_topups`, and it does **not** change privileges of any role other than `service_role`. The migration runner (function owner) keeps its existing privileges on all tables.

| Function | Tables used (INSERT/UPDATE) | Touched by 20260246? | Owner has required privilege? |
|----------|-----------------------------|----------------------|--------------------------------|
| atomic_token_deduct | token_usage: INSERT, SELECT; token_topups: SELECT | No | Yes (owner unchanged) |
| atomic_token_refund | token_usage: INSERT, SELECT | No | Yes (owner unchanged) |
| atomic_stripe_webhook_process | webhook_events: INSERT; token_topups: INSERT; subscriptions: SELECT, UPDATE | Only for service_role; owner unchanged | Yes (owner unchanged) |
| atomic_stripe_event_record | webhook_events: INSERT | Only for service_role; owner unchanged | Yes (owner unchanged) |

So after 20260246, the **owner** of each function still has the INSERT/UPDATE (and SELECT) needed on the affected tables.

---

## 3. Dependency on service_role privileges

- **Execution path:** Caller is `service_role` (only role with EXECUTE). The function runs as **owner** (e.g. postgres), so table access uses the **owner’s** privileges.
- **Dependency on service_role:** Only that **service_role** must have **EXECUTE** on the function. There is **no** reliance on `service_role` having INSERT/UPDATE on any table for these functions to work.
- **If owner were service_role:** Then `atomic_stripe_webhook_process` would run as `service_role` and would need INSERT on `token_topups`. 20260246 does not grant `service_role` any rights on `token_topups` (by design; see runbook 20260245). So with owner = service_role, **atomic_stripe_webhook_process** would **FAIL**. The migrations do not set owner to service_role, so in the current setup this does not apply.

---

## 4. PASS/FAIL per function

| Function | Owner has required INSERT/UPDATE after 20260246? | Depends on service_role table privileges? | Verdict |
|----------|---------------------------------------------------|-------------------------------------------|---------|
| atomic_token_deduct | Yes | No (only EXECUTE) | **PASS** |
| atomic_token_refund | Yes | No (only EXECUTE) | **PASS** |
| atomic_stripe_webhook_process | Yes | No (only EXECUTE) | **PASS** |
| atomic_stripe_event_record | Yes | No (only EXECUTE) | **PASS** |

---

## 5. Summary

- **Owner role:** Inferred as **postgres** (migration runner); not set in SQL.
- **20260246:** Only tightens **service_role** on `subscriptions`, `user_metadata`, `webhook_events`. Does not alter the migration runner’s (or any other role’s) privileges.
- **Table privileges:** All four functions use tables either untouched by 20260246 (`token_usage`, `token_topups`) or only restricted for `service_role` (`webhook_events`, `subscriptions`). The function owner’s privileges are unchanged, so the owner still has the required INSERT/UPDATE (and SELECT where used).
- **service_role:** Used only as the allowed **caller** (EXECUTE). No dependency on service_role’s table grants for the function bodies.

**All four functions: PASS** after 20260246, as long as the function owner remains the migration runner (e.g. postgres) and not service_role.
