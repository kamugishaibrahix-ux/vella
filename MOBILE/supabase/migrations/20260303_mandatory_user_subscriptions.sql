-- Migration: Mandatory subscription row creation for all users
-- Created: 2026-03-03
-- Purpose: Ensure every auth.users row has a corresponding subscriptions row
-- This makes credit checks deterministic and eliminates silent fallback issues

-- ============================================================
-- PHASE 1: DATABASE TRIGGER FOR NEW USERS
-- ============================================================

-- Create function to handle new user subscription creation
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
    monthly_token_allocation,
    monthly_token_allocation_used,
    current_period_start,
    current_period_end
  )
  values (
    new.id,
    'free',
    10000,
    0,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month'
  );

  return new;
end;
$$;

-- Create trigger on auth.users to auto-create subscription row
-- Drop first to ensure idempotency
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_subscription();

-- ============================================================
-- PHASE 2: BACKFILL EXISTING USERS
-- ============================================================

-- Insert subscription rows for all existing users who don't have one
insert into public.subscriptions (
  user_id,
  tier,
  monthly_token_allocation,
  monthly_token_allocation_used,
  current_period_start,
  current_period_end
)
select
  id,
  'free',
  10000,
  0,
  date_trunc('month', now()),
  date_trunc('month', now()) + interval '1 month'
from auth.users
where not exists (select 1 from public.subscriptions s where s.user_id = id);

-- ============================================================
-- PHASE 3: VERIFICATION QUERIES (Run manually to verify)
-- ============================================================

-- Verify counts match:
-- select count(*) as subscription_count from public.subscriptions;
-- select count(*) as user_count from auth.users;
-- These two numbers should be equal after migration runs.

-- Find any orphaned users (should return 0 rows):
-- select id from auth.users
-- where id not in (select user_id from public.subscriptions);

-- Summary by plan (uses plan, NOT tier):
-- select plan, count(*) from public.subscriptions group by plan;
