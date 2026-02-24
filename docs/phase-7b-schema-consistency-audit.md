# Phase 7B: Schema Consistency Audit Report

## Executive Summary

**Status**: ❌ **FAIL** - Critical issues found that must be fixed before migration

This audit identified **3 critical issues** and **1 warning** that must be resolved before running migrations.

---

## Critical Issues

### ❌ ISSUE 1: Foreign Key Mismatch - `user_metadata.user_id`

**Location**: `apps/vella-control/supabase/migrations/20250101T000000_vella_core_admin.sql:57`

**Problem**:
```sql
user_id uuid primary key references public.profiles(id) on delete cascade,
```

**Expected**:
```sql
user_id uuid primary key references auth.users(id) on delete cascade,
```

**Impact**: 
- `user_metadata` should reference `auth.users(id)` directly, not `profiles(id)`
- All other admin tables (`system_logs`, `feedback`, `token_ledger`) correctly reference `profiles(id)` OR have nullable `user_id`
- This inconsistency will cause FK constraint violations if `profiles` row doesn't exist but `auth.users` row does
- MOBILE code expects `user_metadata` to work with `auth.users` IDs directly

**Code References**:
- `MOBILE/lib/admin/adminPolicy.ts:82` - Queries `user_metadata` using `auth.users` IDs
- `apps/vella-control/app/api/admin/users/*` - All routes use `auth.users` IDs

**Fix Required**: Change FK from `profiles(id)` to `auth.users(id)`

---

### ❌ ISSUE 2: Missing Foreign Key Constraint - `admin_activity_log.admin_id`

**Location**: `apps/vella-control/supabase/migrations/20250101T000000_vella_core_admin.sql:112`

**Problem**:
```sql
admin_id uuid not null, -- admin user who performed action
```

**Expected**:
```sql
admin_id uuid not null references auth.users(id) on delete set null,
```

**Impact**:
- No referential integrity for admin actions
- Cannot track which admin performed actions if admin user is deleted
- Should allow `on delete set null` to preserve audit trail even if admin user is deleted

**Code References**:
- `apps/vella-control/app/api/admin/*` - All routes insert `admin_id` from `auth.users` IDs

**Fix Required**: Add FK constraint to `auth.users(id)` with `on delete set null`

---

### ❌ ISSUE 3: Column Type Mismatch - `subscriptions.monthly_token_allocation_used`

**Location**: 
- Migration: `MOBILE/supabase/migrations/20250217_token_engine.sql:25` defines as `int`
- Code expects: `bigint` (used in `chargeTokens.ts`)

**Problem**:
```sql
-- Migration defines:
add column if not exists monthly_token_allocation_used int not null default 0;

-- But code uses:
const allocationUsed = subscription.monthly_token_allocation_used ?? 0;
// This is used in calculations that expect bigint precision
```

**Impact**:
- `int` in PostgreSQL is 32-bit (max ~2.1 billion)
- `bigint` is 64-bit (max ~9.2 quintillion)
- Token usage can exceed `int` limits for high-usage users
- TypeScript types in `MOBILE/lib/supabase/types.ts` expect `number | null` which maps to `bigint` in Supabase

**Code References**:
- `MOBILE/lib/tokens/chargeTokens.ts:34,54` - Selects and uses `monthly_token_allocation_used`
- `MOBILE/lib/tokens/getUserTokenState.ts:31` - Selects `monthly_token_allocation_used`
- `MOBILE/lib/supabase/types.ts:94` - TypeScript type expects `number | null` (maps to `bigint`)

**Fix Required**: Change column type from `int` to `bigint` in migration `20250217_token_engine.sql`

---

## Warnings

### ⚠️ WARNING 1: `admin_global_config` Table Still Exists But Not Used

**Location**: 
- Migration: `apps/vella-control/supabase/migrations/20251129154622_create_admin_global_config.sql`
- Migration: `apps/vella-control/supabase/migrations/20250101T000000_vella_core_admin.sql:41-47,190,232-238`

**Status**: 
- Table is created and has RLS policies
- **NO code references found** - All admin config code uses `admin_ai_config` instead
- Migration `20250101T000000_vella_core_admin.sql` adds `active` column to `admin_global_config` but it's never queried

**Impact**: 
- Table exists but is unused (dead code)
- Adds unnecessary complexity
- Migration adds column that will never be used

**Recommendation**: 
- Option A: Remove `admin_global_config` table entirely (cleaner)
- Option B: Keep it for future use but document it as "reserved"
- **Current audit**: Mark as warning only - not blocking migration, but should be cleaned up

---

## Verified: Tables & Columns Match Code

### ✅ `admin_ai_config` - FULLY VERIFIED

**Migration**: `20250101T000000_vella_core_admin.sql:23-30`
**Code References**:
- `MOBILE/lib/admin/adminConfig.ts:222-223` - Selects `config, is_active, created_at`
- `apps/vella-control/app/api/admin/config/save/route.ts:27-28` - Selects `id, config`
- `apps/vella-control/app/api/admin/config/get/route.ts:13-14` - Selects `config, is_active, created_at, updated_at, label`

**Columns Verified**:
- ✅ `id` (uuid PK) - Used in save route
- ✅ `config` (jsonb) - Used in all routes
- ✅ `is_active` (boolean) - Used in all queries
- ✅ `label` (text nullable) - Used in get route
- ✅ `created_at`, `updated_at` (timestamptz) - Used in queries

**RLS Verified**:
- ✅ Read policy: `admin_ai_config_read` allows all authenticated users (MOBILE needs this)
- ✅ Write policy: `admin_ai_config_write` requires admin (correct)

---

### ✅ `user_metadata` - FULLY VERIFIED (except FK issue above)

**Migration**: `20250101T000000_vella_core_admin.sql:56-71`
**Code References**:
- `MOBILE/lib/admin/adminPolicy.ts:82` - Selects `user_id, plan, token_balance, status, voice_enabled, realtime_beta, tokens_per_month, notes`
- `apps/vella-control/app/api/admin/users/*` - All routes select/update various columns

**Columns Verified**:
- ✅ `user_id` (uuid PK) - Used in all routes
- ✅ `plan` (text) - Used in policy and update-plan route
- ✅ `token_balance` (bigint) - Used in policy and update-tokens route
- ✅ `status` (text) - Used in policy and update-status route
- ✅ `voice_enabled` (boolean) - Used in policy and update-voice route
- ✅ `realtime_beta` (boolean) - Used in policy and update-realtime route
- ✅ `tokens_per_month` (bigint) - Used in policy (monthly token limit)
- ✅ `notes` (text nullable) - Used in policy and update-notes route
- ✅ `email`, `full_name` (text nullable) - Denormalized for admin panel (not used in MOBILE)
- ✅ `last_active_at` (timestamptz nullable) - For admin panel (not used in MOBILE)
- ✅ `admin` (boolean) - Used in RLS policies
- ✅ `created_at`, `updated_at` (timestamptz) - Audit timestamps

**RLS Verified**:
- ✅ Read policy: `user_metadata_read_own` allows users to read own row OR admin/service-role (correct)
- ✅ Write policy: `user_metadata_write` requires admin/service-role (correct)

**FK Issue**: See ISSUE 1 above

---

### ✅ `system_logs` - FULLY VERIFIED

**Migration**: `20250101T000000_vella_core_admin.sql:87-96`
**Code References**:
- `MOBILE/lib/admin/runtimeEvents.ts:56` - Inserts `user_id, level, source, code, message, metadata, created_at`
- `apps/vella-control/app/api/admin/logs/list/route.ts:25` - Selects `*`

**Columns Verified**:
- ✅ `id` (uuid PK) - Auto-generated
- ✅ `user_id` (uuid nullable) - Used in inserts (nullable for system-level logs)
- ✅ `level` (text) - Used in inserts (`'info' | 'warn' | 'error'`)
- ✅ `source` (text) - Used in inserts
- ✅ `code` (text nullable) - Used in inserts
- ✅ `message` (text) - Used in inserts (max 200 chars enforced in code)
- ✅ `metadata` (jsonb nullable) - Used in inserts
- ✅ `created_at` (timestamptz) - Auto-generated

**RLS Verified**:
- ✅ Insert policy: `system_logs_insert` allows users to insert own logs or system logs (user_id = auth.uid() OR user_id IS NULL) (correct)
- ✅ Read policy: `system_logs_read` requires admin/service-role (correct)

---

### ✅ `admin_activity_log` - FULLY VERIFIED (except FK issue above)

**Migration**: `20250101T000000_vella_core_admin.sql:110-117`
**Code References**:
- `apps/vella-control/app/api/admin/*` - All mutation routes insert `admin_id, action, previous, next, created_at`

**Columns Verified**:
- ✅ `id` (uuid PK) - Auto-generated
- ✅ `admin_id` (uuid) - Used in all inserts (see ISSUE 2 for missing FK)
- ✅ `action` (text) - Used in all inserts (e.g., `'config.save'`, `'users.update-plan'`)
- ✅ `previous` (jsonb nullable) - Used in all inserts
- ✅ `next` (jsonb nullable) - Used in all inserts
- ✅ `created_at` (timestamptz) - Auto-generated

**RLS Verified**:
- ✅ All operations: `admin_only_admin_activity_log` requires admin/service-role (correct)

**FK Issue**: See ISSUE 2 above

---

### ✅ `feedback` - FULLY VERIFIED

**Migration**: `20250101T000000_vella_core_admin.sql:132-140`
**Code References**:
- `MOBILE/lib/admin/runtimeEvents.ts:101` - Inserts `user_id, session_id, rating, channel, category, created_at`
- `apps/vella-control/app/api/admin/feedback/list/route.ts:30-31` - Selects `id, user_id, session_id, channel, rating, category, created_at`

**Columns Verified**:
- ✅ `id` (uuid PK) - Auto-generated
- ✅ `user_id` (uuid) - Used in inserts and selects
- ✅ `session_id` (uuid nullable) - Used in inserts and selects (optional session reference)
- ✅ `rating` (integer nullable) - Used in inserts and selects (1-10 scale, CHECK constraint in migration)
- ✅ `channel` (text) - Used in inserts and selects (`'voice' | 'text'`, CHECK constraint in migration)
- ✅ `category` (text nullable) - Used in inserts and selects
- ✅ `created_at` (timestamptz) - Auto-generated

**RLS Verified**:
- ✅ Insert policy: `feedback_insert` allows users to insert own feedback (user_id = auth.uid()) (correct)
- ✅ Read policy: `feedback_read` requires admin/service-role (correct)

---

### ✅ `token_ledger` - FULLY VERIFIED

**Migration**: `20250101T000000_vella_core_admin.sql:157-163`
**Code References**:
- `apps/vella-control/app/api/admin/users/update-tokens/route.ts:47` - Inserts `user_id, delta, reason, created_at`

**Columns Verified**:
- ✅ `id` (uuid PK) - Auto-generated
- ✅ `user_id` (uuid) - Used in inserts
- ✅ `delta` (bigint) - Used in inserts (positive for additions, negative for deductions)
- ✅ `reason` (text) - Used in inserts (e.g., `'admin_adjustment'`, `'purchase'`, `'refund'`)
- ✅ `created_at` (timestamptz) - Auto-generated

**RLS Verified**:
- ✅ All operations: `admin_only_token_ledger` requires admin/service-role (correct)

---

### ✅ `analytics_counters` - FULLY VERIFIED

**Migration**: `20250101T000000_vella_core_admin.sql:176-180`
**Code References**:
- `apps/vella-control/app/api/admin/analytics/get/route.ts:13-14` - Selects `key, value`

**Columns Verified**:
- ✅ `key` (text PK) - Used in selects (counter name like `'total_users'`, `'active_users_7d'`)
- ✅ `value` (bigint) - Used in selects
- ✅ `updated_at` (timestamptz) - Auto-updated (not explicitly selected but exists)

**RLS Verified**:
- ✅ All operations: `admin_only_analytics_counters` requires admin/service-role (correct)

---

## Verified: No Duplicate Table Definitions

**Checked**: All migration files in both `MOBILE/supabase/migrations/` and `apps/vella-control/supabase/migrations/`

**Result**: ✅ No duplicate `CREATE TABLE` statements found

- `admin_ai_config` - Only in `20250101T000000_vella_core_admin.sql`
- `user_metadata` - Only in `20250101T000000_vella_core_admin.sql`
- `system_logs` - Only in `20250101T000000_vella_core_admin.sql`
- `admin_activity_log` - Only in `20250101T000000_vella_core_admin.sql`
- `feedback` - Only in `20250101T000000_vella_core_admin.sql`
- `token_ledger` - Only in `20250101T000000_vella_core_admin.sql`
- `analytics_counters` - Only in `20250101T000000_vella_core_admin.sql`

---

## Verified: No Conflicting Migrations

**Checked**: Migration timestamps and dependencies

**Result**: ✅ No conflicts found

- `20251129154622_create_admin_global_config.sql` - Creates `admin_global_config` (earlier timestamp)
- `20250101T000000_vella_core_admin.sql` - Alters `admin_global_config` (later timestamp, uses `ALTER TABLE IF EXISTS`)
- All other tables use `CREATE TABLE IF NOT EXISTS` - safe for re-runs

---

## Verified: RLS Policies Match Intended Access Patterns

### ✅ `admin_ai_config`
- **Intended**: MOBILE read, admin write
- **Actual**: ✅ `admin_ai_config_read` allows all authenticated users (MOBILE can read)
- **Actual**: ✅ `admin_ai_config_write` requires admin/service-role (admin can write)

### ✅ `user_metadata`
- **Intended**: User read own row, admin read/write all
- **Actual**: ✅ `user_metadata_read_own` allows `auth.uid() = user_id` OR admin/service-role
- **Actual**: ✅ `user_metadata_write` requires admin/service-role

### ✅ `system_logs`
- **Intended**: User insert own, admin read
- **Actual**: ✅ `system_logs_insert` allows `auth.uid() = user_id` OR `user_id IS NULL` (system logs)
- **Actual**: ✅ `system_logs_read` requires admin/service-role

### ✅ `feedback`
- **Intended**: User insert own, admin read
- **Actual**: ✅ `feedback_insert` allows `auth.uid() = user_id`
- **Actual**: ✅ `feedback_read` requires admin/service-role

### ✅ `token_ledger`
- **Intended**: Admin-only
- **Actual**: ✅ `admin_only_token_ledger` requires admin/service-role

### ✅ `admin_activity_log`
- **Intended**: Admin-only
- **Actual**: ✅ `admin_only_admin_activity_log` requires admin/service-role

### ✅ `analytics_counters`
- **Intended**: Admin-only
- **Actual**: ✅ `admin_only_analytics_counters` requires admin/service-role

---

## Verified: No Unused Tables

**Checked**: All tables in migrations vs code references

**Result**: ⚠️ `admin_global_config` is unused (see WARNING 1)

**All other tables are used**:
- ✅ `admin_ai_config` - Used in MOBILE and vella-control
- ✅ `user_metadata` - Used in MOBILE and vella-control
- ✅ `system_logs` - Used in MOBILE and vella-control
- ✅ `admin_activity_log` - Used in vella-control
- ✅ `feedback` - Used in MOBILE and vella-control
- ✅ `token_ledger` - Used in vella-control
- ✅ `analytics_counters` - Used in vella-control

---

## Summary

### Critical Issues (Must Fix Before Migration)

1. ❌ **ISSUE 1**: `user_metadata.user_id` FK should reference `auth.users(id)` not `profiles(id)`
2. ❌ **ISSUE 2**: `admin_activity_log.admin_id` missing FK constraint to `auth.users(id)`
3. ❌ **ISSUE 3**: `subscriptions.monthly_token_allocation_used` should be `bigint` not `int`

### Warnings (Should Fix But Not Blocking)

1. ⚠️ **WARNING 1**: `admin_global_config` table exists but is unused

### Verified (All Good)

- ✅ All table columns match code references
- ✅ All RLS policies match intended access patterns
- ✅ No duplicate table definitions
- ✅ No conflicting migrations
- ✅ All critical tables are used (except `admin_global_config`)

---

## Recommended Actions

### Before Migration

1. **Fix ISSUE 1**: Update `user_metadata.user_id` FK in `20250101T000000_vella_core_admin.sql:57`
   ```sql
   user_id uuid primary key references auth.users(id) on delete cascade,
   ```

2. **Fix ISSUE 2**: Add FK constraint to `admin_activity_log.admin_id` in `20250101T000000_vella_core_admin.sql:112`
   ```sql
   admin_id uuid not null references auth.users(id) on delete set null,
   ```

3. **Fix ISSUE 3**: Update column type in `MOBILE/supabase/migrations/20250217_token_engine.sql:25`
   ```sql
   add column if not exists monthly_token_allocation_used bigint not null default 0;
   ```

### After Migration (Optional Cleanup)

4. **Cleanup WARNING 1**: Remove `admin_global_config` table and related migrations if not needed, OR document it as "reserved for future use"

---

## Final Verdict

**Status**: ❌ **FAIL**

**Reason**: 3 critical issues must be fixed before migration can be safely run.

**Next Steps**: Fix the 3 critical issues above, then re-run this audit to verify.

