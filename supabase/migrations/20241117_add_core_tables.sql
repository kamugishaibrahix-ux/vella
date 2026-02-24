-- Vella core schema migration

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text default 'UTC',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_plan') then
    create type subscription_plan as enum ('free', 'pro', 'elite');
  end if;
end $$;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan subscription_plan not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive',
  monthly_token_allocation bigint not null default 0,
  token_balance bigint not null default 0,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);

create unique index if not exists subscriptions_user_unique on public.subscriptions(user_id);

create table if not exists public.token_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  pack_name text not null,
  tokens_awarded bigint not null,
  amount_usd numeric(10, 2) not null,
  status text not null,
  created_at timestamptz default now()
);

create index if not exists token_topups_user_id_idx on public.token_topups(user_id);

create table if not exists public.token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null,
  tokens bigint not null,
  from_allocation boolean not null,
  created_at timestamptz default now()
);

create index if not exists token_usage_user_id_idx on public.token_usage(user_id);

create index if not exists token_usage_created_at_idx on public.token_usage(created_at);

-- emotion_logs and journal_entries removed - now stored locally only

create table if not exists public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz default now(),
  ended_at timestamptz,
  mode text not null,
  created_at timestamptz default now()
);

create index if not exists conversation_sessions_user_id_idx on public.conversation_sessions(user_id);

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'profiles' and not c.relrowsecurity) then
    alter table public.profiles enable row level security;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'subscriptions' and not c.relrowsecurity) then
    alter table public.subscriptions enable row level security;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'token_topups' and not c.relrowsecurity) then
    alter table public.token_topups enable row level security;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'token_usage' and not c.relrowsecurity) then
    alter table public.token_usage enable row level security;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'conversation_sessions' and not c.relrowsecurity) then
    alter table public.conversation_sessions enable row level security;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'users_select_own_profiles') then
    create policy "users_select_own_profiles" on public.profiles
    for select using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'users_insert_own_profile') then
    create policy "users_insert_own_profile" on public.profiles
    for insert with check (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'users_update_own_profile') then
    create policy "users_update_own_profile" on public.profiles
    for update using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'users_delete_own_profile') then
    create policy "users_delete_own_profile" on public.profiles
    for delete using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'users_select_own_subscriptions') then
    create policy "users_select_own_subscriptions" on public.subscriptions
    for select using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'users_insert_own_subscriptions') then
    create policy "users_insert_own_subscriptions" on public.subscriptions
    for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'users_update_own_subscriptions') then
    create policy "users_update_own_subscriptions" on public.subscriptions
    for update using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'users_delete_own_subscriptions') then
    create policy "users_delete_own_subscriptions" on public.subscriptions
    for delete using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'token_topups' and policyname = 'users_select_own_topups') then
    create policy "users_select_own_topups" on public.token_topups
    for select using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'token_topups' and policyname = 'users_insert_own_topups') then
    create policy "users_insert_own_topups" on public.token_topups
    for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'token_usage' and policyname = 'users_select_own_usage') then
    create policy "users_select_own_usage" on public.token_usage
    for select using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'token_usage' and policyname = 'users_insert_own_usage') then
    create policy "users_insert_own_usage" on public.token_usage
    for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_sessions' and policyname = 'users_select_own_conversation_sessions') then
    create policy "users_select_own_conversation_sessions" on public.conversation_sessions
    for select using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_sessions' and policyname = 'users_insert_own_conversation_sessions') then
    create policy "users_insert_own_conversation_sessions" on public.conversation_sessions
    for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_sessions' and policyname = 'users_update_own_conversation_sessions') then
    create policy "users_update_own_conversation_sessions" on public.conversation_sessions
    for update using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_sessions' and policyname = 'users_delete_own_conversation_sessions') then
    create policy "users_delete_own_conversation_sessions" on public.conversation_sessions
    for delete using (auth.uid() = user_id);
  end if;
end $$;
