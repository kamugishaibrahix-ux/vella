create table if not exists admin_global_config (
  id uuid primary key default gen_random_uuid(),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

