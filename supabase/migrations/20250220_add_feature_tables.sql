-- Consolidated migration: feature tables (micro_rag_cache, progress_metrics, social_models, vella_personality)

create table if not exists public.micro_rag_cache (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists micro_rag_cache_updated_at_idx on public.micro_rag_cache(updated_at);

create table if not exists public.progress_metrics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'consistency_score'
  ) then
    alter table public.progress_metrics
      add column consistency_score double precision not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'emotional_openness'
  ) then
    alter table public.progress_metrics
      add column emotional_openness double precision not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'improvement_score'
  ) then
    alter table public.progress_metrics
      add column improvement_score double precision not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'stability_score'
  ) then
    alter table public.progress_metrics
      add column stability_score double precision not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'connection_index'
  ) then
    alter table public.progress_metrics
      add column connection_index double precision not null default 0;
  end if;
end
$$;

create table if not exists public.social_models (
  user_id uuid primary key references auth.users(id) on delete cascade,
  model jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.vella_personality (
  user_id uuid primary key references auth.users(id) on delete cascade,
  traits jsonb not null,
  updated_at timestamptz not null default now()
);

