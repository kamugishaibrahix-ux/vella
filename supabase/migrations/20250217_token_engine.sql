begin;

create table if not exists public.token_rates (
  event text primary key,
  cost int not null
);

insert into public.token_rates (event, cost) values
  ('text_short', 300),
  ('text_long', 500),
  ('emotion_reflection', 700),
  ('deep_dive', 1200),
  ('story_short', 1500),
  ('story_long', 3000),
  ('story_guided', 2500),
  ('voice_minute', 1200),
  ('voice_quick_question', 300),
  ('voice_interval', 600),
  ('checkin', 200),
  ('journal_prompt', 200),
  ('daily_insight', 400)
on conflict (event) do nothing;

alter table public.subscriptions
  add column if not exists monthly_token_allocation_used bigint not null default 0;

alter table public.profiles
  add column if not exists app_language text default 'en',
  add column if not exists theme text default 'system';

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications_enabled boolean not null default true,
  daily_checkin boolean not null default false,
  journaling_prompts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vella_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  voice_model text not null default 'luna',
  tone text not null default 'soft',
  tone_style text not null default 'soft',
  relationship_mode text not null default 'best_friend',
  voice_hud jsonb not null default
    '{"moodChip":true,"stability":true,"deliveryHints":true,"sessionTime":true,"tokenChip":true,"strategyChip":true,"alertChip":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function reset_monthly_tokens()
returns void as $$
begin
  update public.subscriptions
  set monthly_token_allocation_used = 0
  where status = 'active';
end;
$$ language plpgsql;

commit;

