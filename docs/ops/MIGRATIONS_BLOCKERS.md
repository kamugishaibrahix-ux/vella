# Migrations Blockers — 2026-02-27

5 blockers identified. All remediable with SQL-only fixes (new migrations or runbook scripts). No runtime code changes.

---

## B1 — Missing RLS on `user_preferences` and `vella_settings`

**Rule violated:** §4 — RLS is required for any user-scoped table.

**Evidence:**
- File: `supabase/migrations/20250217_token_engine.sql`
- Tables `user_preferences` (PK = user_id → auth.users) and `vella_settings` (PK = user_id → auth.users) are created without `ENABLE ROW LEVEL SECURITY` and without any policies.
- Both are user-scoped (primary key references auth.users) and contain per-user configuration.

**Risk:** Without RLS, any authenticated user with direct Supabase client access could read/write other users' preferences and voice settings. Low content sensitivity (boolean prefs, enum values, JSONB config) but still a privacy violation.

**Remediation SQL:**
```sql
-- New migration: 20260234_rls_user_preferences_vella_settings.sql

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_isolate ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.vella_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY vella_settings_isolate ON public.vella_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## B2 — Missing RLS on `micro_rag_cache`, `social_models`, `vella_personality`

**Rule violated:** §4 — RLS is required for any user-scoped table. §1/§3 — `micro_rag_cache` may store text chunks (local-first violation if so).

**Evidence:**
- File: `supabase/migrations/20250220_add_feature_tables.sql`
- These three tables are created without `ENABLE ROW LEVEL SECURITY`.
- `micro_rag_cache` name suggests it caches RAG (Retrieval-Augmented Generation) text chunks server-side, which would violate the local-first rule if those chunks contain user-generated content.
- Full schema not available from migration summary — **requires manual schema inspection in Supabase Dashboard** to confirm column definitions.

**Risk:** If `micro_rag_cache` stores text chunks derived from user content, it is a local-first violation AND has no RLS. If any of these tables are user-scoped, cross-user reads are possible.

**Remediation SQL (pending schema verification):**
```sql
-- New migration: 20260234_rls_feature_tables.sql
-- STEP 1: Verify schemas in Supabase Dashboard before applying.

-- If micro_rag_cache has a user_id FK and text columns:
ALTER TABLE public.micro_rag_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY micro_rag_cache_isolate ON public.micro_rag_cache
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- If social_models has a user_id FK:
ALTER TABLE public.social_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_models_isolate ON public.social_models
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- If vella_personality has a user_id FK:
ALTER TABLE public.vella_personality ENABLE ROW LEVEL SECURITY;
CREATE POLICY vella_personality_isolate ON public.vella_personality
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- IF micro_rag_cache stores user content text, it must be purged
-- and converted to hash-only (same as memory_chunks_v2 pattern).
-- Create a runbook script for this.
```

**Pre-flight check:**
```sql
-- Run this to inspect the actual schemas before deciding:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('micro_rag_cache', 'social_models', 'vella_personality')
ORDER BY table_name, ordinal_position;
```

---

## B3 — Missing RLS on `progress_metrics` and `connection_depth`

**Rule violated:** §4 — RLS is required for any user-scoped table.

**Evidence:**
- File: `supabase/migrations/20250220_add_feature_tables.sql` (progress_metrics)
- File: `supabase/migrations/20250221_add_progress_features.sql` (connection_depth)
- Both tables have `user_id` columns referencing auth.users but no RLS.
- Content is numeric scores only (not PII), but cross-user reads violate privacy.

**Risk:** Any authenticated user could read other users' progress scores, resilience metrics, and connection depth values.

**Remediation SQL:**
```sql
-- New migration: 20260234_rls_progress_tables.sql

ALTER TABLE public.progress_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY progress_metrics_isolate ON public.progress_metrics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.connection_depth ENABLE ROW LEVEL SECURITY;
CREATE POLICY connection_depth_isolate ON public.connection_depth
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## B4 — Missing RLS on `user_reports` and `promo_codes`

**Rule violated:** §4 — RLS required. §6 — Admin tables must not be readable by normal users.

**Evidence:**
- File: `supabase/migrations/20251221120000_admin_c_mod_tools.sql`
- `user_reports` contains moderation reports about users (summary, notes, severity, assignee). No RLS enabled. Any authenticated user could read reports about any other user.
- `promo_codes` has no RLS. While it's admin data, authenticated users could enumerate all promo codes, including inactive/expired ones.

**Additional concern:** The M4.5 migration (`20260229`) drops `summary` and `notes` columns from `user_reports`, but the admin routes `user-reports/create` and `user-reports/update` still write these columns. If M4.5 is applied before fixing admin routes, those routes will break. The M4.5 drop of user_reports columns should be reviewed — these are admin-operational fields, not user-generated content. They may have been incorrectly included in the content purge.

**Risk:** HIGH for user_reports — moderation data visible to all users. MEDIUM for promo_codes — discount codes visible.

**Remediation SQL:**
```sql
-- New migration: 20260234_rls_admin_mod_tools.sql

-- user_reports: admin-only (service_role writes, no user access)
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Option A: service-role only (no user can see reports about them)
REVOKE ALL ON public.user_reports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_reports TO service_role;

-- Option B: users can see own reports (uncomment instead of Option A)
-- CREATE POLICY user_reports_select_own ON public.user_reports
--   FOR SELECT USING (auth.uid() = user_id);
-- REVOKE INSERT, UPDATE, DELETE ON public.user_reports FROM anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE ON public.user_reports TO service_role;

-- promo_codes: admin-only
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promo_codes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.promo_codes TO service_role;
```

---

## B5 — Unbounded JSONB in `alert-rules/save`

**Rule violated:** §5 — Admin tables must not allow unbounded payloads.

**Evidence:**
- File: `apps/vella-control/app/api/admin/alert-rules/save/route.ts`
- Zod schema: `rules: z.array(z.unknown())` — accepts an arbitrarily large array of arbitrary JSON objects.
- This is written to `admin_ai_config.config` (JSONB column) and also logged to `admin_activity_log.next`.

**Risk:** A compromised or buggy admin panel could write multi-MB payloads into `admin_ai_config` and `admin_activity_log`, causing storage bloat, slow queries, and potential denial-of-service on config reads. No user content risk, but operational safety concern.

**Remediation (code-level — Zod schema fix, not SQL):**

While this report is SQL-only scope, the fix is in the Zod schema:
```typescript
// apps/vella-control/app/api/admin/alert-rules/save/route.ts
const bodySchema = z.object({
  rules: z.array(z.object({
    // define expected alert rule shape
  })).max(50),
});
```

**SQL-level mitigation (optional, defense-in-depth):**
```sql
-- Add size constraint on admin_ai_config.config
ALTER TABLE admin_ai_config
  ADD CONSTRAINT admin_ai_config_max_size
  CHECK (octet_length(config::text) <= 65536);
```

---

## Summary

| Blocker | Severity | Fix Type | Tables Affected |
|---------|----------|----------|-----------------|
| B1 | HIGH | SQL migration (RLS enable + policies) | user_preferences, vella_settings |
| B2 | CRITICAL | SQL migration (RLS) + schema verification | micro_rag_cache, social_models, vella_personality |
| B3 | HIGH | SQL migration (RLS enable + policies) | progress_metrics, connection_depth |
| B4 | HIGH | SQL migration (RLS + REVOKE) | user_reports, promo_codes |
| B5 | MEDIUM | Zod schema fix + optional SQL constraint | admin_ai_config (via alert-rules/save) |

### Recommended Fix Order

1. **B2** — Verify schemas first (pre-flight SQL), then apply RLS. If `micro_rag_cache` stores content, add to purge pipeline.
2. **B4** — Immediate: `user_reports` has sensitive moderation data exposed without RLS.
3. **B1** — Apply RLS to user_preferences and vella_settings.
4. **B3** — Apply RLS to progress_metrics and connection_depth.
5. **B5** — Update Zod schema + optional SQL size constraint.

All fixes can ship as a single migration: `20260234_rls_hardening_pass.sql`.
