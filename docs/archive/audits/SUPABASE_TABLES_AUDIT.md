# Supabase Tables Audit Report

## EXISTING SUPABASE TABLES (from migrations)

The following tables are defined in the migration files and are the **ONLY** tables that should exist in the Supabase database:

### Core Tables (20241117_add_core_tables.sql)
- `profiles`
- `subscriptions`
- `token_topups`
- `token_usage`
- `conversation_sessions`

### Admin Tables (20250101000000_vella_core_admin.sql)
- `admin_ai_config`
- `admin_global_config`
- `user_metadata`
- `system_logs`
- `admin_activity_log`
- `feedback`
- `token_ledger`
- `analytics_counters`

### Token & Settings Tables (20250217_token_engine.sql)
- `token_rates`
- `user_preferences`
- `vella_settings`

### Trait Tables (20250218_add_adaptive_traits.sql)
- `user_traits`
- `user_traits_history`

### Feature Tables (20250219_add_nudge_history.sql, 20250220_add_feature_tables.sql, 20250221_add_progress_features.sql)
- `user_nudges`
- `micro_rag_cache`
- `progress_metrics`
- `social_models`
- `vella_personality`
- `connection_depth`

---

## COMPLETE LIST (Alphabetical)

1. `admin_activity_log`
2. `admin_ai_config`
3. `admin_global_config`
4. `analytics_counters`
5. `connection_depth`
6. `conversation_sessions`
7. `feedback`
8. `micro_rag_cache`
9. `progress_metrics`
10. `profiles`
11. `social_models`
12. `subscriptions`
13. `system_logs`
14. `token_ledger`
15. `token_rates`
16. `token_topups`
17. `token_usage`
18. `user_metadata`
19. `user_nudges`
20. `user_preferences`
21. `user_traits`
22. `user_traits_history`
23. `vella_personality`
24. `vella_settings`

**Total: 24 tables**

---

## TABLES REFERENCED IN CODE BUT NOT IN MIGRATIONS

The following tables are referenced in the codebase but **DO NOT EXIST** in any migration file:

### ❌ Missing Tables (Must use local storage only)

1. **`user_goals`** 
   - Referenced in: `MOBILE/lib/goals/goalEngine.ts`
   - Used by: `/api/goals`, `/api/forecast`
   - **Action Required:** All goal functionality must run in local storage mode only.

2. **`user_goal_actions`**
   - Referenced in: `MOBILE/lib/goals/goalEngine.ts`
   - Used by: `/api/goals`
   - **Action Required:** All goal action functionality must run in local storage mode only.

3. **`last_active`** (as a table)
   - Referenced in: `MOBILE/lib/memory/lastActive.ts` (queries `fromSafe("last_active")`)
   - **Note:** `last_active` is actually a **column** on `profiles` table (added in `20250222_add_last_active_at.sql`), not a separate table.
   - **Action Required:** Update `lastActive.ts` to query `profiles.last_active_at` or `profiles.last_active` instead of a non-existent `last_active` table.

---

## CONFIRMATION

✅ **These 24 tables are the ONLY tables the app is allowed to read/write.**

✅ **Any code referencing missing tables (ex: `user_goals`, `user_goal_actions`, `last_active` as a table) must degrade to local storage.**

✅ **No API route should ever error because a table does not exist.**

✅ **No feature should require userId or Supabase auth to work.**

✅ **Supabase is an OPTIONAL metadata layer only.**

---

## CRITICAL FINDINGS

### 1. Goals System
- **Status:** ❌ **BROKEN** - References non-existent tables
- **Tables Referenced:** `user_goals`, `user_goal_actions`
- **Files Affected:**
  - `MOBILE/lib/goals/goalEngine.ts` - All functions query these tables
  - `MOBILE/app/api/goals/route.ts` - API route depends on goalEngine
  - `MOBILE/app/api/forecast/route.ts` - Calls `listGoals()` which queries non-existent tables
- **Required Action:** 
  - All goal operations must use local storage only
  - `goalEngine.ts` must return empty arrays/null when Supabase unavailable
  - Never throw errors for missing `user_goals` or `user_goal_actions` tables

### 2. Last Active Tracking
- **Status:** ⚠️ **MISCONFIGURED** - Queries non-existent table
- **Table Referenced:** `last_active` (as table)
- **Actual Schema:** `profiles.last_active_at` and `profiles.last_active` (columns)
- **Files Affected:**
  - `MOBILE/lib/memory/lastActive.ts` - Queries `fromSafe("last_active")` which doesn't exist
- **Required Action:**
  - Update `lastActive.ts` to query `profiles` table with `last_active_at` or `last_active` column
  - Or: Make it optional and use local storage fallback

---

## MIGRATION STATUS

✅ **No new migrations should be added**
✅ **No existing database structure should be altered**
✅ **All 24 existing tables are metadata-only (no user content)**

---

## NEXT STEPS

1. **Fix `goalEngine.ts`** - Remove all Supabase queries for `user_goals` and `user_goal_actions`, use local storage only
2. **Fix `lastActive.ts`** - Query `profiles` table instead of non-existent `last_active` table
3. **Update all API routes** - Ensure they gracefully handle missing tables (return empty data, never throw)
4. **Remove auth dependencies** - All features must work without `requireUserId()` or Supabase auth

---

**End of Audit Report**

