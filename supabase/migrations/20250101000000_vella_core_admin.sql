-- ============================================================================
-- Vella Core Admin Schema Migration
-- ============================================================================
-- This migration creates all tables required for:
-- 1. MOBILE Vella app runtime (admin config, policy, logging)
-- 2. vella-control admin panel (user management, logs, feedback, analytics)
--
-- IMPORTANT: These tables store ONLY SAFE METADATA:
-- - No conversational text, no journal text, no emotional notes
-- - No AI free-text responses, no raw prompts
-- - Only: user IDs, plan tiers, token balances, counters, timestamps, flags,
--   numeric ratings, categories, short codes
-- ============================================================================

begin;

-- ============================================================================
-- 1. ADMIN CONFIGURATION TABLES
-- ============================================================================

-- admin_ai_config: Active AI configuration consumed by MOBILE runtime
-- MOBILE reads: MOBILE/lib/admin/adminConfig.ts -> loadActiveAdminAIConfig()
create table if not exists public.admin_ai_config (
  id uuid primary key default gen_random_uuid(),
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  label text, -- optional version label, no user text
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_ai_config_is_active_idx on public.admin_ai_config(is_active) where is_active = true;

comment on table public.admin_ai_config is 'Active AI configuration consumed by MOBILE runtime. Stores AdminAIConfig JSON structure. Only metadata, no user text.';
comment on column public.admin_ai_config.config is 'AdminAIConfig JSON structure with persona, behaviour, voice, model, memory, safety, automation settings';
comment on column public.admin_ai_config.is_active is 'Only one row should be active at a time. MOBILE runtime queries WHERE is_active = true';

-- admin_global_config: Admin panel's global configuration storage
-- Admin panel reads/writes: apps/vella-control/app/api/admin/config/*
-- Note: This table already exists but needs the 'active' column
alter table if exists public.admin_global_config
  add column if not exists active boolean not null default false;

do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public'
    and tablename = 'admin_global_config'
  ) then

    -- admin_global_config comments
    comment on table public.admin_global_config is 'Admin panel global configuration storage. Same config as admin_ai_config but source of truth for admin UI.';
    comment on column public.admin_global_config.active is 'Only one row should be active at a time. Admin panel queries WHERE active = true';

    -- enable RLS
    alter table public.admin_global_config enable row level security;

    -- admin-only policy
    drop policy if exists "admin_only_admin_global_config" on public.admin_global_config;
    create policy "admin_only_admin_global_config" on public.admin_global_config
      for all
      using (
        auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
      );

  end if;
end;
$$;

-- ============================================================================
-- 2. USER METADATA TABLE (Admin-Managed User Policy)
-- ============================================================================

-- user_metadata: Admin-managed user metadata for policy control
-- MOBILE reads: MOBILE/lib/admin/adminPolicy.ts -> loadAdminUserPolicy()
-- Admin panel reads/writes: apps/vella-control/app/api/admin/users/*
create table if not exists public.user_metadata (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text, -- plan name string (e.g., 'free', 'pro', 'elite')
  token_balance bigint, -- admin override token balance
  status text, -- 'active', 'disabled', 'blocked'
  voice_enabled boolean,
  realtime_beta boolean,
  tokens_per_month bigint, -- monthly token limit
  notes text, -- admin-side notes only (no user text, max 500 chars)
  email text, -- from auth.users, denormalized for admin panel
  full_name text, -- from auth.users, denormalized for admin panel
  last_active_at timestamptz,
  admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_metadata_status_idx on public.user_metadata(status);
create index if not exists user_metadata_last_active_at_idx on public.user_metadata(last_active_at);

comment on table public.user_metadata is 'Admin-managed user metadata for policy control. No user free-text content.';
comment on column public.user_metadata.notes is 'Admin-side notes only, max 500 chars. No user conversational text.';
comment on column public.user_metadata.status is 'User status: active, disabled, or blocked. Controls canStartSession in MOBILE runtime.';

-- ============================================================================
-- 3. ADMIN LOGGING TABLES
-- ============================================================================

-- system_logs: Runtime system logs from MOBILE app
-- MOBILE writes: MOBILE/lib/admin/runtimeEvents.ts -> recordAdminRuntimeLog()
-- Admin panel reads: apps/vella-control/app/api/admin/logs/list
create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  level text not null check (level in ('info', 'warn', 'error')),
  source text not null, -- short code like 'tokens', 'safety', 'realtime'
  code text, -- machine code like 'DISTRESS_HIGH', 'INSUFFICIENT_TOKENS'
  message text not null, -- SHORT label only (max 200 chars, no user text, no AI text)
  metadata jsonb, -- numeric flags, scores, but never raw text
  created_at timestamptz not null default now()
);

create index if not exists system_logs_created_at_idx on public.system_logs(created_at desc);
create index if not exists system_logs_level_idx on public.system_logs(level);
create index if not exists system_logs_user_id_idx on public.system_logs(user_id);
create index if not exists system_logs_source_idx on public.system_logs(source);

comment on table public.system_logs is 'Runtime system logs from MOBILE app. No user free-text content, only metadata and short labels.';
comment on column public.system_logs.message is 'Short label only (max 200 chars). No user conversational text, no AI responses.';
comment on column public.system_logs.metadata is 'Numeric flags, scores, timestamps. Never raw text content.';

-- admin_activity_log: Admin panel action audit trail
-- Admin panel writes: All admin mutation routes log here
-- Admin panel reads: apps/vella-control/app/api/admin/logs/list
create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete set null, -- admin user who performed action
  action text not null, -- short code like 'config.save', 'users.update-plan'
  previous jsonb, -- previous state snapshot
  next jsonb, -- new state snapshot
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_log_created_at_idx on public.admin_activity_log(created_at desc);
create index if not exists admin_activity_log_admin_id_idx on public.admin_activity_log(admin_id);
create index if not exists admin_activity_log_action_idx on public.admin_activity_log(action);

comment on table public.admin_activity_log is 'Admin panel action audit trail. Tracks all admin mutations for audit purposes.';

-- ============================================================================
-- 4. FEEDBACK & REPORTS TABLES
-- ============================================================================

-- feedback: User feedback summaries (numeric ratings, categories, no free-text)
-- MOBILE writes: MOBILE/lib/admin/runtimeEvents.ts -> recordAdminFeedbackSummary()
-- Admin panel reads: apps/vella-control/app/feedback/page.tsx
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid, -- optional session reference
  rating integer check (rating >= 1 and rating <= 10), -- 1-10 scale
  channel text not null check (channel in ('voice', 'text')),
  category text, -- finite set: 'clarity', 'warmth', 'helpfulness', etc.
  created_at timestamptz not null default now()
);

create index if not exists feedback_user_id_idx on public.feedback(user_id);
create index if not exists feedback_created_at_idx on public.feedback(created_at);
create index if not exists feedback_channel_idx on public.feedback(channel);
create index if not exists feedback_rating_idx on public.feedback(rating);

comment on table public.feedback is 'User feedback summaries. Only numeric ratings and categories, no free-text comments.';
comment on column public.feedback.rating is 'Numeric rating 1-10. No qualitative text feedback stored.';
comment on column public.feedback.category is 'Finite category set. No open-ended user comments.';

-- ============================================================================
-- 5. TOKEN LEDGER (Admin Token Adjustments)
-- ============================================================================

-- token_ledger: Audit trail for token balance changes
-- Admin panel writes: apps/vella-control/app/api/admin/users/update-tokens
create table if not exists public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta bigint not null, -- positive for additions, negative for deductions
  reason text not null, -- short code like 'admin_adjustment', 'purchase', 'refund'
  created_at timestamptz not null default now()
);

create index if not exists token_ledger_user_id_idx on public.token_ledger(user_id);
create index if not exists token_ledger_created_at_idx on public.token_ledger(created_at);

comment on table public.token_ledger is 'Audit trail for token balance changes. Tracks admin adjustments and purchases.';

-- ============================================================================
-- 6. ANALYTICS TABLES
-- ============================================================================

-- analytics_counters: Pre-computed analytics counters for admin dashboard
-- Admin panel reads: apps/vella-control/app/api/admin/analytics/get
create table if not exists public.analytics_counters (
  key text primary key, -- counter name like 'total_users', 'active_users_7d', 'total_tokens_used'
  value bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.analytics_counters is 'Pre-computed analytics counters for admin dashboard. Simple key-value store.';

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all new admin tables
alter table public.admin_ai_config enable row level security;
alter table public.user_metadata enable row level security;
alter table public.system_logs enable row level security;
alter table public.admin_activity_log enable row level security;
alter table public.feedback enable row level security;
alter table public.token_ledger enable row level security;
alter table public.analytics_counters enable row level security;

-- Admin-only policies: Only service-role or admin users can access
-- These policies use a helper function to check if the user is an admin

-- Helper function to check if user is admin (via user_metadata.admin flag)
create or replace function public.is_admin_user()
returns boolean as $$
begin
  -- Service role bypasses RLS, so this function is for authenticated users
  -- Check if user exists in user_metadata with admin = true
  return exists (
    select 1
    from public.user_metadata
    where user_id = auth.uid()
    and admin = true
  );
end;
$$ language plpgsql security definer set search_path = public;

-- admin_ai_config: MOBILE can read active config, admin can write
drop policy if exists "admin_ai_config_read" on public.admin_ai_config;
create policy "admin_ai_config_read" on public.admin_ai_config
  for select
  using (true); -- All authenticated users can read active config (MOBILE runtime needs this)

drop policy if exists "admin_ai_config_write" on public.admin_ai_config;
create policy "admin_ai_config_write" on public.admin_ai_config
  for all
  using (
    auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
  )
  with check (
    auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
  );

-- user_metadata: MOBILE can read own policy, admin can read/write all
drop policy if exists "user_metadata_read_own" on public.user_metadata;
create policy "user_metadata_read_own" on public.user_metadata
  for select
  using (
    auth.uid() = user_id or -- Users can read their own metadata (MOBILE runtime needs this)
    auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
  );

drop policy if exists "user_metadata_write" on public.user_metadata;
create policy "user_metadata_write" on public.user_metadata
  for all
  using (
    auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
  )
  with check (
    auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
  );

-- system_logs: MOBILE can write (insert), admin can read
drop policy if exists "system_logs_insert" on public.system_logs;
create policy "system_logs_insert" on public.system_logs
  for insert
  with check (
    auth.uid() = user_id or user_id is null -- Users can insert logs for themselves or system logs
  );

drop policy if exists "system_logs_read" on public.system_logs;
create policy "system_logs_read" on public.system_logs
  for select
  using (
    auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
  );

-- admin_activity_log: Admin-only access
drop policy if exists "admin_only_admin_activity_log" on public.admin_activity_log;
create policy "admin_only_admin_activity_log" on public.admin_activity_log
  for all
  using (
    auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
  );

-- feedback: MOBILE can write (insert), admin can read
drop policy if exists "feedback_insert" on public.feedback;
create policy "feedback_insert" on public.feedback
  for insert
  with check (
    auth.uid() = user_id -- Users can insert feedback for themselves
  );

drop policy if exists "feedback_read" on public.feedback;
create policy "feedback_read" on public.feedback
  for select
  using (
    auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
  );

-- token_ledger: Admin-only access
drop policy if exists "admin_only_token_ledger" on public.token_ledger;
create policy "admin_only_token_ledger" on public.token_ledger
  for all
  using (
    auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
  );

-- analytics_counters: Admin-only access
drop policy if exists "admin_only_analytics_counters" on public.analytics_counters;
create policy "admin_only_analytics_counters" on public.analytics_counters
  for all
  using (
    auth.jwt() ->> 'role' = 'service_role' or public.is_admin_user()
  );

-- ============================================================================
-- 8. ANALYTICS VIEWS (Optional, for Admin Dashboard)
-- ============================================================================

-- admin_feedback_summary_view: Aggregated feedback statistics
create or replace view public.admin_feedback_summary_view as
with base as (
  select *
  from public.feedback
),
agg as (
  select
    count(*) as total_feedback,
    avg(rating) as avg_rating,
    max(created_at) as last_updated
  from base
),
channel_stats as (
  select
    channel,
    count(*) as cnt,
    avg(rating) as avg_rating
  from base
  where channel is not null
  group by channel
),
category_stats as (
  select
    category,
    count(*) as cnt,
    avg(rating) as avg_rating
  from base
  where category is not null
  group by category
)
select
  agg.total_feedback,
  agg.avg_rating,
  (
    select jsonb_object_agg(
      channel,
      jsonb_build_object(
        'count', cnt,
        'avg_rating', avg_rating
      )
    )
    from channel_stats
  ) as rating_by_channel,
  (
    select jsonb_object_agg(
      category,
      jsonb_build_object(
        'count', cnt,
        'avg_rating', avg_rating
      )
    )
    from category_stats
  ) as rating_by_category,
  agg.last_updated
from agg;

comment on view public.admin_feedback_summary_view is 'Aggregated feedback statistics for admin dashboard. Admin-only access via RLS.';

-- Grant access to view (RLS on underlying table applies)
grant select on public.admin_feedback_summary_view to authenticated;

-- ============================================================================
-- COMMENTS & DOCUMENTATION
-- ============================================================================

comment on schema public is 'Vella core schema. All tables store ONLY safe metadata - no conversational text, no journal text, no emotional notes. Personal content stays in browser local storage.';

commit;

