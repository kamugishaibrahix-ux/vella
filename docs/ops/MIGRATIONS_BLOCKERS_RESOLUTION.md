# Migrations Blockers Resolution — 2026-02-27

All 5 blockers from `MIGRATIONS_BLOCKERS.md` resolved.

---

## B1 — Missing RLS on `user_preferences` and `vella_settings`

**Fix:** New migration `supabase/migrations/20260227_root_rls_user_prefs_vella_settings.sql`

| Action | Detail |
|--------|--------|
| Enable RLS | Both tables |
| Policies | SELECT/INSERT/UPDATE/DELETE restricted to `auth.uid() = user_id` |
| Constraints added | `vella_settings.voice_hud` max 4KB (`pg_column_size`), text columns max 64 chars |
| Comments added | Documenting no user content, RLS enforced |

**Status:** CLOSED

---

## B2 — Unbounded JSONB cache tables without RLS

**Verified schemas** (from `20250220_add_feature_tables.sql`):
- `micro_rag_cache`: `(user_id PK, data jsonb NOT NULL, updated_at)`
- `social_models`: `(user_id PK, model jsonb NOT NULL, updated_at)`
- `vella_personality`: `(user_id PK, traits jsonb NOT NULL, updated_at)`

All three are user-scoped (PK = user_id → auth.users). None had RLS.

**Fix:** New migration `supabase/migrations/20260227_root_harden_cache_tables.sql`

| Action | Detail |
|--------|--------|
| Enable RLS | All three tables |
| Policies | SELECT/INSERT/UPDATE/DELETE restricted to `auth.uid() = user_id` |
| Size constraints | `micro_rag_cache.data` ≤ 32KB, `social_models.model` ≤ 16KB, `vella_personality.traits` ≤ 8KB |
| Comments | Explicit "NO user content" documentation on every JSONB column |

**Preflight script:** `supabase/runbook-sql/20260227_preflight_cache_tables.sql`
- Detects oversized rows that would violate new constraints
- Checks for forbidden JSONB keys (content, text, body, message, note, transcript, journal, prompt, response)

**Status:** CLOSED

---

## B3 — Missing RLS on `progress_metrics` and `connection_depth`

**Fix:** New migration `supabase/migrations/20260227_root_rls_progress_connection.sql`

| Action | Detail |
|--------|--------|
| Enable RLS | Both tables |
| Policies | SELECT/INSERT/UPDATE/DELETE restricted to `auth.uid() = user_id` |
| Constraints | `progress_metrics.data` JSONB max 8KB |
| Comments | Documenting numeric-only content |

**Status:** CLOSED

---

## B4 — Missing RLS on `user_reports` and `promo_codes`

**Fix:** New migration `supabase/migrations/20260227_root_rls_user_reports_promo_codes.sql`

| Action | Detail |
|--------|--------|
| Enable RLS | Both tables |
| user_reports policy | `USING (false)` deny-all + REVOKE from anon/authenticated. Service-role only. |
| promo_codes policy | `USING (false)` deny-all + REVOKE from anon/authenticated. Service-role only. |
| Length constraints | `summary` ≤ 500, `notes` ≤ 2000, `type` ≤ 100, `severity` ≤ 50, `code` ≤ 64, `applies_to_plan` ≤ 32 |

**Status:** CLOSED

---

## B5 — Unbounded JSONB in `alert-rules/save`

**Fix (DB layer):** New migration `supabase/migrations/20260227_admin_config_size_constraints.sql`

| Constraint | Table.Column | Limit |
|------------|-------------|-------|
| `admin_ai_config_config_max_size` | `admin_ai_config.config` | 64KB |
| `admin_ai_config_label_max_length` | `admin_ai_config.label` | 128 chars |
| `admin_activity_log_previous_max_size` | `admin_activity_log.previous` | 64KB |
| `admin_activity_log_next_max_size` | `admin_activity_log.next` | 64KB |
| `admin_activity_log_action_max_length` | `admin_activity_log.action` | 128 chars |
| `system_logs_message_max_length` | `system_logs.message` | 200 chars |
| `system_logs_metadata_max_size` | `system_logs.metadata` | 8KB |
| `user_metadata_notes_max_length` | `user_metadata.notes` | 500 chars |

**Fix (API layer):** `apps/vella-control/app/api/admin/alert-rules/save/route.ts`

| Change | Detail |
|--------|--------|
| Zod schema | Replaced `z.array(z.unknown())` with strict `alertRuleSchema` (typed fields: id, name, condition, threshold, action, enabled, severity, cooldownMinutes) |
| Array limit | `.max(50)` — max 50 rules |
| String limits | name ≤ 128, condition ≤ 256, id ≤ 64 |
| Audit log | Now logs `rule_count` + `rule_ids` only, not full rule payloads |

**Verification:** `grep -r "z.array(z.unknown" apps/vella-control/` → 0 matches.

**Status:** CLOSED

---

## Contract Drift — Resolved

**Fix files:**
- `packages/vella-contract/src/types.ts`
- `packages/vella-contract/src/entitlements.ts`
- `packages/vella-contract/src/features.ts`

| Change | Detail |
|--------|--------|
| `PlanEntitlement` | Added `isPaid: boolean` and `usesAllocationBucket: boolean` (structural, not admin-configurable) |
| Default entitlements | All four (RESTRICTED, FREE, PRO, ELITE) updated with correct `isPaid`/`usesAllocationBucket` values |
| `normalizeToPlanTier` | Legacy alias mapping (`basic`→`free`, `premium`→`elite`) now gated behind `ALLOW_LEGACY_PLAN_ALIASES = false` — consistent with MOBILE |
| Feature type utilities | `getTierFeatures`, `isFeatureEnabledByDefault`, `getAllEntitlementFlags`, `getFeatureEntitlement`, `getFeaturesByEntitlement` — all updated to exclude `isPaid`/`usesAllocationBucket` from feature flag types |
| TypeScript verification | `npx tsc --noEmit` → exit code 0 (no errors) |

**Status:** CLOSED

---

## Summary

| Blocker | Migration / File | Status |
|---------|-----------------|--------|
| B1 | `supabase/migrations/20260227_root_rls_user_prefs_vella_settings.sql` | ✅ CLOSED |
| B2 | `supabase/migrations/20260227_root_harden_cache_tables.sql` + `supabase/runbook-sql/20260227_preflight_cache_tables.sql` | ✅ CLOSED |
| B3 | `supabase/migrations/20260227_root_rls_progress_connection.sql` | ✅ CLOSED |
| B4 | `supabase/migrations/20260227_root_rls_user_reports_promo_codes.sql` | ✅ CLOSED |
| B5 | `supabase/migrations/20260227_admin_config_size_constraints.sql` + `apps/vella-control/app/api/admin/alert-rules/save/route.ts` | ✅ CLOSED |
| Contract | `packages/vella-contract/src/{types,entitlements,features}.ts` | ✅ CLOSED |
