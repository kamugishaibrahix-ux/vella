-- Forward Migration: Subscription Provisioning System
-- Version: 20260401
-- Purpose: Idempotent provisioning trigger and backfill
-- Schema: Uses plan column (not tier)

-- ============================================================
-- A) CREATE TRIGGER FUNCTION (Idempotent)
-- ============================================================

-- Drop existing function to ensure clean replacement
drop function if exists public.handle_new_user_subscription() cascade;

-- Create trigger function for new user provisioning
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Idempotent insert: only creates if subscription doesn't exist
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
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ============================================================
-- B) CREATE TRIGGER (Idempotent)
-- ============================================================

-- Drop existing trigger if any (idempotent)
drop trigger if exists on_auth_user_created on auth.users;

-- Create trigger to auto-provision subscriptions on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_subscription();

-- ============================================================
-- C) BACKFILL EXISTING USERS (Idempotent)
-- ============================================================

-- Insert subscription rows for all existing users who don't have one
-- Uses plan column only (not tier)
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
)
on conflict (user_id) do nothing;
