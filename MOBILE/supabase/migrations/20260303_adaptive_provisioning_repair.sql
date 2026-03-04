-- Migration: Adaptive Subscription Provisioning Repair
-- Created: 2026-03-03
-- Purpose: Fixes provisioning to match actual schema (plan enum vs tier text)
-- This migration inspects the real schema and adapts accordingly

-- ============================================================
-- STEP 1 & 2: Schema Inspection (Logged for verification)
-- ============================================================

-- Log actual column names for verification
do $$
declare
  col_record record;
  plan_values text;
begin
  raise notice 'INSPECTING SCHEMA...';
  
  -- Log all columns in subscriptions table
  for col_record in 
    select column_name, data_type, udt_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions'
    order by ordinal_position
  loop
    raise notice 'Column: % (Type: %, UDT: %)', 
      col_record.column_name, 
      col_record.data_type,
      col_record.udt_name;
  end loop;
  
  -- Log plan enum values if plan column exists
  begin
    select string_agg(val::text, ', ')
    into plan_values
    from unnest(enum_range(null::plan)) as val;
    raise notice 'Plan enum values: %', plan_values;
  exception when undefined_object then
    raise notice 'Plan enum not found, checking for tier column';
  end;
end $$;

-- ============================================================
-- STEP 3: Create Correct Trigger Function
-- ============================================================

-- Drop existing function to ensure clean replacement
drop function if exists public.handle_new_user_subscription() cascade;

-- Create function with dynamic column detection
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_plan boolean;
  has_tier boolean;
  has_status boolean;
  has_token_balance boolean;
  has_created_at boolean;
  free_plan_value text;
begin
  -- Detect actual schema
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'plan'
  ) into has_plan;
  
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'tier'
  ) into has_tier;
  
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'status'
  ) into has_status;
  
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'token_balance'
  ) into has_token_balance;
  
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'created_at'
  ) into has_created_at;
  
  -- Determine free plan value
  begin
    -- Try to use 'free' enum value
    free_plan_value := 'free';
    -- Test if it works
    perform 'free'::plan;
  exception when others then
    -- If 'free' fails, try 'FREE' or just use text
    free_plan_value := 'free';
  end;
  
  -- Dynamic insert based on actual schema
  if has_plan then
    -- Schema uses 'plan' column (enum type)
    if has_status and has_token_balance and has_created_at then
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
      ) values (
        new.id,
        free_plan_value::plan,
        'active',
        10000,
        0,
        10000,
        date_trunc('month', now()),
        date_trunc('month', now()) + interval '1 month',
        now(),
        now()
      );
    elsif has_status and has_created_at then
      insert into public.subscriptions (
        user_id,
        plan,
        status,
        monthly_token_allocation,
        monthly_token_allocation_used,
        current_period_start,
        current_period_end,
        created_at,
        updated_at
      ) values (
        new.id,
        free_plan_value::plan,
        'active',
        10000,
        0,
        date_trunc('month', now()),
        date_trunc('month', now()) + interval '1 month',
        now(),
        now()
      );
    elsif has_status then
      insert into public.subscriptions (
        user_id,
        plan,
        status,
        monthly_token_allocation,
        monthly_token_allocation_used,
        current_period_start,
        current_period_end
      ) values (
        new.id,
        free_plan_value::plan,
        'active',
        10000,
        0,
        date_trunc('month', now()),
        date_trunc('month', now()) + interval '1 month'
      );
    else
      insert into public.subscriptions (
        user_id,
        plan,
        monthly_token_allocation,
        monthly_token_allocation_used,
        current_period_start,
        current_period_end
      ) values (
        new.id,
        free_plan_value::plan,
        10000,
        0,
        date_trunc('month', now()),
        date_trunc('month', now()) + interval '1 month'
      );
    end if;
    
  elsif has_tier then
    -- Schema uses 'tier' column (text or enum)
    if has_status and has_token_balance and has_created_at then
      insert into public.subscriptions (
        user_id,
        tier,
        status,
        monthly_token_allocation,
        monthly_token_allocation_used,
        token_balance,
        current_period_start,
        current_period_end,
        created_at,
        updated_at
      ) values (
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
    elsif has_status and has_created_at then
      insert into public.subscriptions (
        user_id,
        tier,
        status,
        monthly_token_allocation,
        monthly_token_allocation_used,
        current_period_start,
        current_period_end,
        created_at,
        updated_at
      ) values (
        new.id,
        'free',
        'active',
        10000,
        0,
        date_trunc('month', now()),
        date_trunc('month', now()) + interval '1 month',
        now(),
        now()
      );
    elsif has_status then
      insert into public.subscriptions (
        user_id,
        tier,
        status,
        monthly_token_allocation,
        monthly_token_allocation_used,
        current_period_start,
        current_period_end
      ) values (
        new.id,
        'free',
        'active',
        10000,
        0,
        date_trunc('month', now()),
        date_trunc('month', now()) + interval '1 month'
      );
    else
      insert into public.subscriptions (
        user_id,
        tier,
        monthly_token_allocation,
        monthly_token_allocation_used,
        current_period_start,
        current_period_end
      ) values (
        new.id,
        'free',
        10000,
        0,
        date_trunc('month', now()),
        date_trunc('month', now()) + interval '1 month'
      );
    end if;
  else
    -- Minimal schema - only required columns
    insert into public.subscriptions (
      user_id,
      monthly_token_allocation,
      monthly_token_allocation_used,
      current_period_start,
      current_period_end
    ) values (
      new.id,
      10000,
      0,
      date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month'
    );
  end if;

  return new;
end;
$$;

-- ============================================================
-- STEP 4: Create / Replace Trigger
-- ============================================================

-- Drop existing trigger if any
drop trigger if exists on_auth_user_created on auth.users;

-- Create trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_subscription();

raise notice 'Trigger on_auth_user_created installed successfully';

-- ============================================================
-- STEP 5: Backfill Existing Users
-- ============================================================

-- Create temporary function for backfill with same schema detection
create or replace function public.backfill_missing_subscriptions()
returns integer
language plpgsql
security definer
as $$
declare
  inserted_count integer := 0;
  has_plan boolean;
  has_tier boolean;
  has_status boolean;
  has_token_balance boolean;
  has_created_at boolean;
  free_plan_value text;
begin
  -- Detect schema
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'plan'
  ) into has_plan;
  
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'tier'
  ) into has_tier;
  
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'status'
  ) into has_status;
  
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'token_balance'
  ) into has_token_balance;
  
  select exists(
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'created_at'
  ) into has_created_at;

  -- Determine free value
  free_plan_value := 'free';

  -- Execute appropriate insert
  if has_plan then
    if has_status and has_token_balance and has_created_at then
      insert into public.subscriptions (
        user_id, plan, status, monthly_token_allocation, monthly_token_allocation_used,
        token_balance, current_period_start, current_period_end, created_at, updated_at
      )
      select 
        u.id, free_plan_value::plan, 'active', 10000, 0, 10000,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
        now(), now()
      from auth.users u
      where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
      
    elsif has_status and has_created_at then
      insert into public.subscriptions (
        user_id, plan, status, monthly_token_allocation, monthly_token_allocation_used,
        current_period_start, current_period_end, created_at, updated_at
      )
      select 
        u.id, free_plan_value::plan, 'active', 10000, 0,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
        now(), now()
      from auth.users u
      where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
      
    elsif has_status then
      insert into public.subscriptions (
        user_id, plan, status, monthly_token_allocation, monthly_token_allocation_used,
        current_period_start, current_period_end
      )
      select 
        u.id, free_plan_value::plan, 'active', 10000, 0,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'
      from auth.users u
      where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
      
    else
      insert into public.subscriptions (
        user_id, plan, monthly_token_allocation, monthly_token_allocation_used,
        current_period_start, current_period_end
      )
      select 
        u.id, free_plan_value::plan, 10000, 0,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'
      from auth.users u
      where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
    end if;
    
  elsif has_tier then
    if has_status and has_token_balance and has_created_at then
      insert into public.subscriptions (
        user_id, tier, status, monthly_token_allocation, monthly_token_allocation_used,
        token_balance, current_period_start, current_period_end, created_at, updated_at
      )
      select 
        u.id, 'free', 'active', 10000, 0, 10000,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
        now(), now()
      from auth.users u
      where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
      
    elsif has_status and has_created_at then
      insert into public.subscriptions (
        user_id, tier, status, monthly_token_allocation, monthly_token_allocation_used,
        current_period_start, current_period_end, created_at, updated_at
      )
      select 
        u.id, 'free', 'active', 10000, 0,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
        now(), now()
      from auth.users u
      where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
      
    elsif has_status then
      insert into public.subscriptions (
        user_id, tier, status, monthly_token_allocation, monthly_token_allocation_used,
        current_period_start, current_period_end
      )
      select 
        u.id, 'free', 'active', 10000, 0,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'
      from auth.users u
      where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
      
    else
      insert into public.subscriptions (
        user_id, tier, monthly_token_allocation, monthly_token_allocation_used,
        current_period_start, current_period_end
      )
      select 
        u.id, 'free', 10000, 0,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'
      from auth.users u
      where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
    end if;
    
  else
    -- Minimal schema
    insert into public.subscriptions (
      user_id, monthly_token_allocation, monthly_token_allocation_used,
      current_period_start, current_period_end
    )
    select 
      u.id, 10000, 0,
      date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'
    from auth.users u
    where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
  end if;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- Execute backfill
select public.backfill_missing_subscriptions() as backfilled_count;

-- Clean up helper function
drop function if exists public.backfill_missing_subscriptions();

-- ============================================================
-- STEP 6: Verification
-- ============================================================

-- Log verification results
do $$
declare
  user_count integer;
  sub_count integer;
  orphan_count integer;
  sample_alloc integer;
begin
  -- Count users
  select count(*) into user_count from auth.users;
  
  -- Count subscriptions
  select count(*) into sub_count from public.subscriptions;
  
  -- Count orphaned users
  select count(*) into orphan_count 
  from auth.users u 
  where not exists (select 1 from public.subscriptions s where s.user_id = u.id);
  
  -- Sample allocation
  select monthly_token_allocation into sample_alloc 
  from public.subscriptions 
  limit 1;
  
  raise notice 'VERIFICATION RESULTS:';
  raise notice '  User count: %', user_count;
  raise notice '  Subscription count: %', sub_count;
  raise notice '  Orphaned users: %', orphan_count;
  raise notice '  Sample allocation: %', sample_alloc;
  raise notice '  Counts match: %', (user_count = sub_count);
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

-- To verify allocation:
-- select distinct plan, tier, monthly_token_allocation from public.subscriptions limit 10;
