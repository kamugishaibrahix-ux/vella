-- Migration: Profiles-then-Subscriptions Provisioning System
-- Version: 20260402
-- Purpose: Fix FK constraint issue (subscriptions.user_id -> profiles.id)
-- Strategy: Ensure profiles exist first, then subscriptions can be inserted

-- ============================================================
-- A) PRECONDITIONS / SAFETY CHECKS
-- ============================================================

do $$
declare
  v_auth_users_exists boolean;
  v_subscriptions_exists boolean;
  v_profiles_exists boolean;
  v_enum_exists boolean;
  v_has_free_value boolean;
  v_fk_exists boolean;
begin
  -- Check auth.users exists
  select exists(
    select 1 from information_schema.tables 
    where table_schema = 'auth' and table_name = 'users'
  ) into v_auth_users_exists;
  
  if not v_auth_users_exists then
    raise exception 'CRITICAL: auth.users table does not exist';
  end if;
  raise notice '✓ auth.users exists';

  -- Check public.subscriptions exists
  select exists(
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'subscriptions'
  ) into v_subscriptions_exists;
  
  if not v_subscriptions_exists then
    raise exception 'CRITICAL: public.subscriptions table does not exist';
  end if;
  raise notice '✓ public.subscriptions exists';

  -- Check public.profiles exists
  select exists(
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'profiles'
  ) into v_profiles_exists;
  
  if not v_profiles_exists then
    raise exception 'CRITICAL: public.profiles table does not exist';
  end if;
  raise notice '✓ public.profiles exists';

  -- Check subscription_plan enum exists
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

  -- Check FK constraint subscriptions_user_id_fkey exists
  select exists(
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
    and constraint_name = 'subscriptions_user_id_fkey'
    and constraint_type = 'FOREIGN KEY'
  ) into v_fk_exists;
  
  if not v_fk_exists then
    raise exception 'CRITICAL: FK constraint subscriptions_user_id_fkey does not exist';
  end if;
  raise notice '✓ FK constraint subscriptions_user_id_fkey exists';

  raise notice 'All preconditions passed. Proceeding with migration...';
end $$;

-- ============================================================
-- B) BACKFILL PROFILES FOR EXISTING USERS
-- ============================================================

-- Insert minimal profiles rows for all auth.users missing a profile
-- This uses ONLY the id column; if profiles has other NOT NULL columns without defaults,
-- this will fail loudly so we can inspect and adjust
insert into public.profiles (id)
select u.id from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

raise notice '✓ Profiles backfill completed';

-- ============================================================
-- C) PROFILE PROVISIONING FUNCTION
-- ============================================================

-- Drop existing function
drop function if exists public.handle_new_user_profile() cascade;

-- Create function to auto-create profile on signup
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  
  return new;
end;
$$;

raise notice '✓ Profile provisioning function created';

-- ============================================================
-- D) INSTALL PROFILE TRIGGER
-- ============================================================

-- Drop existing trigger
drop trigger if exists on_auth_user_profile_created on auth.users;

-- Create trigger for profile auto-creation
create trigger on_auth_user_profile_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_profile();

raise notice '✓ Profile trigger installed';

-- ============================================================
-- E) SUBSCRIPTION PROVISIONING FUNCTION
-- ============================================================

-- Drop existing function
drop function if exists public.handle_new_user_subscription() cascade;

-- Create function to auto-create subscription on signup
-- First ensures profile exists (FK requirement), then inserts subscription
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- First ensure profile exists (FK requirement)
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  
  -- Then insert subscription
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
    'free'::subscription_plan,
    'active',
    10000,
    0,
    10000,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month',
    now(),
    now()
  )
  on conflict (user_id) do nothing;
  
  return new;
end;
$$;

raise notice '✓ Subscription provisioning function created';

-- ============================================================
-- F) INSTALL SUBSCRIPTION TRIGGER
-- ============================================================

-- Drop existing trigger
drop trigger if exists on_auth_user_created on auth.users;

-- Create trigger for subscription auto-creation
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_subscription();

raise notice '✓ Subscription trigger installed';

-- ============================================================
-- G) BACKFILL SUBSCRIPTIONS FOR EXISTING USERS
-- ============================================================

-- Now that profiles exist, backfill subscriptions for all users
-- Must join to profiles to satisfy FK constraint
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
  'free'::subscription_plan,
  'active',
  10000,
  0,
  10000,
  date_trunc('month', now()),
  date_trunc('month', now()) + interval '1 month',
  now(),
  now()
from auth.users u
join public.profiles p on p.id = u.id
where not exists (select 1 from public.subscriptions s where s.user_id = u.id)
on conflict (user_id) do nothing;

raise notice '✓ Subscriptions backfill completed';

-- ============================================================
-- H) END-OF-MIGRATION VERIFICATION SELECT
-- ============================================================

select
  (select count(*)::int from auth.users) as user_count,
  (select count(*)::int from public.profiles) as profile_count,
  (select count(*)::int from public.subscriptions) as subscription_count,
  (select count(*)::int from auth.users u 
   where not exists (select 1 from public.profiles p where p.id = u.id)) as orphan_profiles,
  (select count(*)::int from auth.users u 
   where not exists (select 1 from public.subscriptions s where s.user_id = u.id)) as orphan_subscriptions,
  (select count(*)::int from pg_trigger where tgname = 'on_auth_user_profile_created')::boolean as trigger_profile_exists,
  (select count(*)::int from pg_trigger where tgname = 'on_auth_user_created')::boolean as trigger_subscription_exists,
  (select count(*)::int from public.subscriptions 
   where plan = 'free' and monthly_token_allocation = 10000) as free_correct_allocation;
