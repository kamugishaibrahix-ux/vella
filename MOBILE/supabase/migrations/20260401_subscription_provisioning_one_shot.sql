-- One-Shot Migration: Subscription Provisioning System Repair
-- Version: 20260401
-- Purpose: Idempotent provisioning trigger + backfill for all users
-- Schema verified from: 20241117_add_core_tables.sql
-- Free allocation: 10,000 (matches DEFAULT_FREE_ENTITLEMENTS.maxMonthlyTokens)

-- ============================================================
-- A) PRECONDITIONS / SAFETY CHECKS
-- ============================================================

do $$
declare
  v_subscriptions_exists boolean;
  v_auth_users_exists boolean;
  v_enum_exists boolean;
  v_has_free_value boolean;
  v_user_id_exists boolean;
  v_unique_exists boolean;
begin
  -- Check public.subscriptions exists
  select exists(
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'subscriptions'
  ) into v_subscriptions_exists;
  
  if not v_subscriptions_exists then
    raise exception 'CRITICAL: public.subscriptions table does not exist';
  end if;
  raise notice '✓ public.subscriptions exists';

  -- Check auth.users exists
  select exists(
    select 1 from information_schema.tables 
    where table_schema = 'auth' and table_name = 'users'
  ) into v_auth_users_exists;
  
  if not v_auth_users_exists then
    raise exception 'CRITICAL: auth.users table does not exist';
  end if;
  raise notice '✓ auth.users exists';

  -- Check subscription_plan enum exists with 'free' value
  select exists(
    select 1 from pg_type t 
    join pg_namespace n on t.typnamespace = n.oid 
    where n.nspname = 'public' and t.typname = 'subscription_plan'
  ) into v_enum_exists;
  
  if not v_enum_exists then
    raise exception 'CRITICAL: subscription_plan enum does not exist';
  end if;
  raise notice '✓ subscription_plan enum exists';

  -- Check 'free' is in the enum
  select 'free'::subscription_plan is not null into v_has_free_value;
  raise notice '✓ free value exists in enum';

  -- Check subscriptions.user_id column exists
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'user_id'
  ) into v_user_id_exists;
  
  if not v_user_id_exists then
    raise exception 'CRITICAL: subscriptions.user_id column does not exist';
  end if;
  raise notice '✓ subscriptions.user_id exists';

  -- Check unique constraint on user_id
  select exists(
    select 1 from pg_indexes 
    where schemaname = 'public' and tablename = 'subscriptions' and indexname = 'subscriptions_user_unique'
  ) into v_unique_exists;
  
  if not v_unique_exists then
    raise notice '⚠ Creating missing unique index on user_id...';
    create unique index if not exists subscriptions_user_unique on public.subscriptions(user_id);
  else
    raise notice '✓ Unique constraint on user_id exists';
  end if;

  raise notice 'All preconditions passed. Proceeding with migration...';
end $$;

-- ============================================================
-- B) PROVISIONING FUNCTION
-- ============================================================

-- Drop existing function to ensure clean replacement
drop function if exists public.handle_new_user_subscription() cascade;

-- Create trigger function for new user provisioning
-- SECURITY DEFINER allows insert despite RLS
-- SET search_path = public, pg_catalog is required for Supabase
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- Insert subscription row for new user
  -- Uses ON CONFLICT for idempotency (safe to re-run)
  insert into public.subscriptions (
    user_id,
    plan,
    status,
    monthly_token_allocation,
    monthly_token_allocation_used,
    token_balance,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  )
  values (
    new.id,
    'free'::subscription_plan,  -- Explicit cast to enum type
    'active',                   -- Active status (not 'inactive' default)
    10000,                      -- Free plan: 10,000 monthly tokens (source of truth)
    0,                          -- No tokens used yet
    10000,                      -- Starting balance = monthly allocation
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month',
    now(),
    now()
  )
  on conflict (user_id) do nothing;  -- Idempotent: skip if already exists

  return new;
end;
$$;

raise notice '✓ Provisioning function handle_new_user_subscription() created';

-- ============================================================
-- C) TRIGGER (IDEMPOTENT)
-- ============================================================

-- Drop existing trigger if any
drop trigger if exists on_auth_user_created on auth.users;

-- Create trigger to auto-provision subscriptions on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_subscription();

raise notice '✓ Trigger on_auth_user_created installed on auth.users';

-- ============================================================
-- D) BACKFILL EXISTING USERS (IDEMPOTENT)
-- ============================================================

-- Insert subscription rows for all existing users who don't have one
-- Uses NOT EXISTS for safety and ON CONFLICT as fail-safe
-- SECURITY DEFINER context allows insert despite RLS
insert into public.subscriptions (
  user_id,
  plan,
  status,
  monthly_token_allocation,
  monthly_token_allocation_used,
  token_balance,
  current_period_start,
  current_period_end,
  created_at,
  updated_at
)
select
  u.id,
  'free'::subscription_plan,  -- Explicit cast to enum type
  'active',
  10000,                      -- Free plan: 10,000 monthly tokens
  0,
  10000,                      -- Starting balance
  date_trunc('month', now()),
  date_trunc('month', now()) + interval '1 month',
  now(),
  now()
from auth.users u
where not exists (
  select 1 from public.subscriptions s where s.user_id = u.id
)
on conflict (user_id) do nothing;  -- Idempotent: skip if already exists

raise notice '✓ Backfill completed for existing users';

-- ============================================================
-- E) VERIFICATION OUTPUT (NON-DESTRUCTIVE)
-- ============================================================

-- Return comprehensive verification metrics
select
  (select count(*)::int from auth.users) as user_count,
  (select count(*)::int from public.subscriptions) as subscription_count,
  (select count(*)::int from auth.users u 
   where not exists (select 1 from public.subscriptions s where s.user_id = u.id)) as orphan_users,
  (select count(*)::int from pg_trigger where tgname = 'on_auth_user_created')::boolean as trigger_exists,
  (select count(*)::int from public.subscriptions where plan = 'free') as free_rows,
  (select count(*)::int from public.subscriptions 
   where plan = 'free' and monthly_token_allocation = 10000) as free_correct_allocation;
