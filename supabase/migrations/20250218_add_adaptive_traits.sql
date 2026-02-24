create table if not exists public.user_traits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  resilience numeric not null default 50,
  clarity numeric not null default 50,
  discipline numeric not null default 50,
  emotional_stability numeric not null default 50,
  motivation numeric not null default 50,
  self_compassion numeric not null default 50,
  last_computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_traits_history (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  resilience numeric not null,
  clarity numeric not null,
  discipline numeric not null,
  emotional_stability numeric not null,
  motivation numeric not null,
  self_compassion numeric not null,
  source text not null default 'auto',
  created_at timestamptz not null default now()
);

create index if not exists user_traits_history_user_window_idx
  on public.user_traits_history (user_id, window_start desc);

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'user_traits' and not c.relrowsecurity) then
    alter table public.user_traits enable row level security;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'user_traits_history' and not c.relrowsecurity) then
    alter table public.user_traits_history enable row level security;
  end if;
end $$;

do $policy$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_traits'
      and policyname = 'Allow users to read their trait state'
  ) then
    create policy "Allow users to read their trait state"
      on public.user_traits
      for select
      using (auth.uid() = user_id);
  end if;
end;
$policy$;

do $policy$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_traits_history'
      and policyname = 'Allow users to read their trait history'
  ) then
    create policy "Allow users to read their trait history"
      on public.user_traits_history
      for select
      using (auth.uid() = user_id);
  end if;
end;
$policy$;
