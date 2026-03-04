-- Migration: Plan-Only Subscription Provisioning
-- Created: 2026-03-03
-- Purpose: Use ONLY plan column (not tier) for subscription provisioning
-- Schema: subscriptions uses plan enum column

-- ============================================================
-- STEP 1: Create Correct Trigger Function (Plan Only)
-- ============================================================

-- Drop existing function to ensure clean replacement
drop function if exists public.handle_new_user_subscription() cascade;

-- Create function using ONLY plan column
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    'free',
    'active',
    10000,
    0,
    10000,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month',
    now(),
    now()
  );

  return new;
end;
$$;

-- ============================================================
-- STEP 2: Create / Replace Trigger
-- ============================================================

-- Drop existing trigger if any
drop trigger if exists on_auth_user_created on auth.users;

-- Create trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_subscription();

-- ============================================================
-- STEP 3: Backfill Existing Users (Plan Only)
-- ============================================================

-- Insert subscription rows for all existing users who don't have one
-- Uses ONLY plan column, not tier
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
  'free',
  'active',
  10000,
  0,
  10000,
  date_trunc('month', now()),
  date_trunc('month', now()) + interval '1 month',
  now(),
  now()
from auth.users u
where not exists (
  select 1 from public.subscriptions s where s.user_id = u.id
);

-- ============================================================
-- STEP 4: Verification Logging
-- ============================================================

do $$
declare
  user_count integer;
  sub_count integer;
  orphan_count integer;
  sample_alloc integer;
  sample_plan text;
begin
  -- Count users
  select count(*) into user_count from auth.users;
  
  -- Count subscriptions
  select count(*) into sub_count from public.subscriptions;
  
  -- Count orphaned users
  select count(*) into orphan_count 
  from auth.users u 
  where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
  
  -- Sample allocation and plan
  select monthly_token_allocation, plan::text 
  into sample_alloc, sample_plan
  from public.subscriptions 
  limit 1;
  
  raise notice 'VERIFICATION RESULTS:';
  raise notice '  User count: %', user_count;
  raise notice '  Subscription count: %', sub_count;
  raise notice '  Orphaned users: %', orphan_count;
  raise notice '  Sample plan: %', sample_plan;
  raise notice '  Sample allocation: %', sample_alloc;
  raise notice '  Counts match: %', (user_count = sub_count);
  raise notice '  Plan is free: %', (sample_plan = 'free');
  raise notice '  Allocation correct: %', (sample_alloc = 10000);
end $$;

-- ============================================================
-- VERIFICATION QUERIES (Run these to confirm)
-- ============================================================

-- To verify trigger exists:
-- select tgname from pg_trigger where tgname = 'on_auth_user_created';

-- To verify counts match:
-- select count(*) from auth.users;
-- select count(*) from public.subscriptions;

-- To verify no orphans:
-- select count(*) from auth.users u where not exists (
--   select 1 from public.subscriptions s where s.user_id = u.id
-- );

-- To verify plan and allocation (uses plan, NOT tier):
-- select distinct plan, monthly_token_allocation from public.subscriptions limit 10;
