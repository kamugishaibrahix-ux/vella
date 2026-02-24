create table if not exists public.user_nudges (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  nudge_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_nudges_user_created_idx
  on public.user_nudges (user_id, created_at desc);

alter table public.user_nudges enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_nudges'
      AND policyname = 'Users select their nudges'
  ) THEN
    CREATE POLICY "Users select their nudges"
      ON public.user_nudges
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

create policy "Users insert their nudges"
  on public.user_nudges
  for insert
  with check (auth.uid() = user_id);

