-- Consolidated migration: progress features (connection_depth, last_active, progress_metrics schema)

create table if not exists public.connection_depth (
  user_id uuid primary key references auth.users(id) on delete cascade,
  depth_score double precision not null default 0,
  last_increase timestamptz default now(),
  last_reciprocated timestamptz,
  updated_at timestamptz default now()
);

alter table public.profiles
  add column if not exists last_active timestamptz;

create table if not exists public.progress_metrics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  consistency_score double precision not null default 0,
  emotional_openness double precision not null default 0,
  improvement_score double precision not null default 0,
  stability_score double precision not null default 0,
  connection_index double precision not null default 0,
  data jsonb,
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'consistency_score'
  ) then
    alter table public.progress_metrics add column consistency_score double precision not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'emotional_openness'
  ) then
    alter table public.progress_metrics add column emotional_openness double precision not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'improvement_score'
  ) then
    alter table public.progress_metrics add column improvement_score double precision not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'stability_score'
  ) then
    alter table public.progress_metrics add column stability_score double precision not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'connection_index'
  ) then
    alter table public.progress_metrics add column connection_index double precision not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'progress_metrics' and column_name = 'data'
  ) then
    alter table public.progress_metrics add column data jsonb;
  end if;
end
$$;

