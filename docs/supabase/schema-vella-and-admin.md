# Vella & Admin Panel Supabase Schema

This document defines the complete Supabase schema required for both the MOBILE Vella app and the vella-control admin panel.

## Design Principles

- **NO PII or Free-Text Storage**: Supabase stores only safe metadata (user IDs, plan tiers, token balances, counters, timestamps, flags, numeric ratings, categories, short codes).
- **NO Conversational Text**: All conversation, journal, and emotional content stays in LOCAL STORAGE only.
- **Admin Tables**: Admin-only tables use RLS policies that restrict access to service-role or admin users.

---

## Core User & Plan Tables

### `profiles`
**Purpose**: User profile metadata (already exists in migrations)

**Columns**:
- `id` uuid PK, FK to `auth.users(id)`
- `display_name` text (nullable)
- `avatar_url` text (nullable)
- `timezone` text default 'UTC'
- `app_language` text default 'en'
- `theme` text default 'system'
- `created_at` timestamptz
- `updated_at` timestamptz

**RLS**: Users can only access their own profile.

---

### `subscriptions`
**Purpose**: User subscription and token allocation (already exists in migrations)

**Columns**:
- `id` uuid PK
- `user_id` uuid FK to `profiles(id)`
- `plan` subscription_plan enum ('free', 'pro', 'elite')
- `stripe_customer_id` text (nullable)
- `stripe_subscription_id` text (nullable)
- `status` text default 'inactive'
- `monthly_token_allocation` bigint default 0
- `monthly_token_allocation_used` int default 0
- `token_balance` bigint default 0
- `current_period_start` timestamptz (nullable)
- `current_period_end` timestamptz (nullable)
- `created_at` timestamptz
- `updated_at` timestamptz

**Indexes**: `user_id`, unique on `user_id`

**RLS**: Users can only access their own subscription.

---

### `user_metadata`
**Purpose**: Admin-managed user metadata for policy control and admin panel display

**Columns**:
- `user_id` uuid PK, FK to `profiles(id)`
- `plan` text (nullable) - plan name string
- `token_balance` bigint (nullable) - admin override token balance
- `status` text (nullable) - 'active', 'disabled', 'blocked'
- `voice_enabled` boolean (nullable)
- `realtime_beta` boolean (nullable)
- `tokens_per_month` bigint (nullable) - monthly token limit
- `notes` text (nullable) - admin-side notes only (no user text)
- `email` text (nullable) - from auth.users, denormalized for admin panel
- `full_name` text (nullable) - from auth.users, denormalized for admin panel
- `last_active_at` timestamptz (nullable)
- `admin` boolean default false
- `created_at` timestamptz
- `updated_at` timestamptz

**Indexes**: `user_id` (PK), `status`, `last_active_at`

**RLS**: Admin-only access (service-role or admin users).

**Usage**:
- MOBILE reads: `loadAdminUserPolicy()` in `MOBILE/lib/admin/adminPolicy.ts`
  - `tokens_per_month` → `AdminUserPolicy.monthlyTokenLimit` → enforced in `chargeTokens()` as hard monthly cap
  - `status` → `AdminUserPolicy.isDisabled` → blocks session start
  - `voice_enabled` / `realtime_beta` → `AdminUserPolicy.realtimeEnabled` → blocks realtime sessions
  - `token_balance` → `AdminUserPolicy.hardTokenCap` → enforced in `chargeTokens()` as hard cap
- Admin panel writes: `/api/admin/users/update-plan`, `/api/admin/users/update-tokens`, `/api/admin/users/update-status`, etc.
- Admin panel reads: `/api/admin/users/list`

---

## Token Management Tables

### `token_usage`
**Purpose**: Log token consumption per user (already exists in migrations)

**Columns**:
- `id` uuid PK
- `user_id` uuid FK to `profiles(id)`
- `source` text - event type (e.g., 'text_short', 'voice_minute')
- `tokens` bigint
- `from_allocation` boolean
- `created_at` timestamptz

**Indexes**: `user_id`, `created_at`

**RLS**: Users can only access their own token usage.

---

### `token_rates`
**Purpose**: Token cost per event type (already exists in migrations)

**Columns**:
- `event` text PK
- `cost` int

**Usage**: `MOBILE/lib/tokens/getTokenCost.ts`

---

### `token_ledger`
**Purpose**: Audit trail for token balance changes (admin adjustments)

**Columns**:
- `id` uuid PK
- `user_id` uuid FK to `profiles(id)`
- `delta` bigint - positive for additions, negative for deductions
- `reason` text - short code like 'admin_adjustment', 'purchase', 'refund'
- `created_at` timestamptz

**Indexes**: `user_id`, `created_at`

**RLS**: Admin-only access.

**Usage**: 
- Admin panel writes when adjusting tokens via `/api/admin/users/update-tokens`
- MOBILE enforces monthly token limit via `chargeTokens()` → checks `user_metadata.tokens_per_month` from `AdminUserPolicy.monthlyTokenLimit`

---

## Admin Configuration Tables

### `admin_ai_config`
**Purpose**: Active AI configuration that MOBILE runtime consumes

**Columns**:
- `id` uuid PK
- `config` jsonb NOT NULL - AdminAIConfig JSON structure
- `is_active` boolean default false - only one row should be active
- `label` text (nullable) - optional version label
- `created_at` timestamptz
- `updated_at` timestamptz

**Indexes**: `is_active` (for filtering active config)

**RLS**: Admin-only access.

**Usage**:
- MOBILE reads: `loadActiveAdminAIConfig()` in `MOBILE/lib/admin/adminConfig.ts`
  - `config.models.embedding_model` → `getEmbeddingModel()` in `MOBILE/lib/ai/embeddings.ts` → used for all embedding calls
  - All other config fields consumed via `loadRuntimeTuning()` and various runtime modules
- Admin panel writes: `/api/admin/config/save` (writes directly to `admin_ai_config`)

---

### `admin_global_config`
**Purpose**: Admin panel's global configuration storage (already exists, needs enhancement)

**Columns**:
- `id` uuid PK
- `config` jsonb NOT NULL
- `active` boolean default false - only one row should be active
- `created_at` timestamptz
- `updated_at` timestamptz

**Indexes**: `active` (for filtering active config)

**RLS**: Admin-only access.

**Usage**:
- Admin panel reads: `/api/admin/config/get`
- Admin panel writes: `/api/admin/config/save`

**Note**: This table stores the same config as `admin_ai_config` but is the source of truth for the admin panel UI.

---

## Admin Logging Tables

### `system_logs`
**Purpose**: Runtime system logs from MOBILE app (no user text, only metadata)

**Columns**:
- `id` uuid PK
- `user_id` uuid (nullable) FK to `profiles(id)`
- `level` text NOT NULL - 'info', 'warn', 'error'
- `source` text NOT NULL - short code like 'tokens', 'safety', 'realtime'
- `code` text (nullable) - machine code like 'DISTRESS_HIGH', 'INSUFFICIENT_TOKENS'
- `message` text NOT NULL - SHORT label only (max 200 chars, no user text, no AI text)
- `metadata` jsonb (nullable) - numeric flags, scores, but never raw text
- `created_at` timestamptz

**Indexes**: `created_at DESC`, `level`, `user_id`, `source`

**RLS**: Admin-only access.

**Usage**:
- MOBILE writes: `recordAdminRuntimeLog()` in `MOBILE/lib/admin/runtimeEvents.ts`
- Admin panel reads: `/api/admin/logs/list` (combined with `admin_activity_log`)

---

### `admin_activity_log`
**Purpose**: Admin panel action audit trail

**Columns**:
- `id` uuid PK
- `admin_id` uuid - admin user who performed action
- `action` text NOT NULL - short code like 'config.save', 'users.update-plan'
- `previous` jsonb (nullable) - previous state snapshot
- `next` jsonb (nullable) - new state snapshot
- `created_at` timestamptz

**Indexes**: `created_at DESC`, `admin_id`, `action`

**RLS**: Admin-only access.

**Usage**:
- Admin panel writes: All admin mutation routes log here
- Admin panel reads: `/api/admin/logs/list` (combined with `system_logs`)

---

## Feedback & Reports Tables

### `feedback`
**Purpose**: User feedback summaries (numeric ratings, categories, no free-text)

**Columns**:
- `id` uuid PK
- `user_id` uuid FK to `profiles(id)`
- `session_id` uuid (nullable)
- `rating` integer (nullable) - 1-5 or 1-10 scale
- `channel` text NOT NULL - 'voice' | 'text'
- `category` text (nullable) - finite set: 'clarity', 'warmth', 'helpfulness', etc.
- `created_at` timestamptz

**Indexes**: `user_id`, `created_at`, `channel`, `rating`

**RLS**: Admin-only access (users don't directly query this).

**Usage**:
- MOBILE writes: `recordAdminFeedbackSummary()` in `MOBILE/lib/admin/runtimeEvents.ts`
- Admin panel reads: `/app/feedback/page.tsx` (with aggregations)

---

## Analytics Tables

### `analytics_counters`
**Purpose**: Pre-computed analytics counters for admin dashboard

**Columns**:
- `key` text PK - counter name like 'total_users', 'active_users_7d', 'total_tokens_used'
- `value` bigint NOT NULL - counter value
- `updated_at` timestamptz

**RLS**: Admin-only access.

**Usage**:
- Admin panel reads: `/api/admin/analytics/get`
- Can be updated via background jobs or triggers

**Note**: This is a simple key-value store. More complex analytics can be computed via views.

---

## Views (Optional, for Analytics)

### `admin_feedback_summary_view`
**Purpose**: Aggregated feedback statistics

**Columns** (computed):
- `total_feedback` bigint
- `avg_rating` numeric
- `rating_by_channel` jsonb
- `rating_by_category` jsonb
- `last_updated` timestamptz

**Source**: Aggregates from `feedback` table

**RLS**: Admin-only access.

---

### `admin_user_summary_view`
**Purpose**: User statistics for admin dashboard

**Columns** (computed):
- `total_users` bigint
- `active_users_7d` bigint
- `active_users_30d` bigint
- `users_by_plan` jsonb
- `users_by_status` jsonb

**Source**: Aggregates from `profiles`, `user_metadata`, `subscriptions`

**RLS**: Admin-only access.

---

## Summary of Tables by Domain

### Core User & Plan
- ✅ `profiles` (exists)
- ✅ `subscriptions` (exists)
- ✅ `user_metadata` (NEW - needed for admin panel)

### Token Management
- ✅ `token_usage` (exists)
- ✅ `token_rates` (exists)
- ✅ `token_ledger` (NEW - needed for admin token adjustments)

### Admin Configuration
- ✅ `admin_global_config` (exists, needs `active` column)
- ✅ `admin_ai_config` (NEW - needed for MOBILE runtime)

### Admin Logging
- ✅ `system_logs` (NEW - needed for MOBILE runtime logging)
- ✅ `admin_activity_log` (NEW - needed for admin panel audit)

### Feedback & Reports
- ✅ `feedback` (NEW - needed for feedback summaries)

### Analytics
- ✅ `analytics_counters` (NEW - needed for admin dashboard)

---

## RLS Policy Summary

### User-Facing Tables (existing RLS)
- `profiles`: Users access own row
- `subscriptions`: Users access own row
- `token_usage`: Users access own rows
- `conversation_sessions`: Users access own rows

### Admin-Only Tables (new RLS)
- `user_metadata`: Service-role or admin users only
- `admin_ai_config`: Service-role or admin users only
- `admin_global_config`: Service-role or admin users only
- `system_logs`: Service-role or admin users only
- `admin_activity_log`: Service-role or admin users only
- `feedback`: Service-role or admin users only
- `token_ledger`: Service-role or admin users only
- `analytics_counters`: Service-role or admin users only

---

## Notes

1. **No PII Storage**: All tables avoid storing conversational text, journal entries, emotional notes, or AI free-text responses. Only metadata, IDs, timestamps, flags, and numeric values.

2. **Local Storage Design**: The MOBILE app stores all personal content (conversations, journals, emotional data) in browser local storage. Supabase is only for metadata, tokens, and admin control.

3. **Admin Panel Expectations**: The admin panel expects certain table structures based on the API clients in `apps/vella-control/lib/api/*`. This schema matches those expectations.

4. **MOBILE Runtime Expectations**: The MOBILE app expects certain table structures based on the code in `MOBILE/lib/admin/*` and `MOBILE/lib/tokens/*`. This schema matches those expectations.

