-- =============================================================================
-- RUNBOOK SQL — Manual execution only. Do not place in migrations/.
-- =============================================================================
-- WHY:     Consolidates vella_settings: adds language, relationship_mode,
--          voice_hud; backfills language from profiles; drops legacy columns
--          (story_mode, cadence, variability, sarcasm_softness,
--          conversation_language).
-- WHEN:    Run only after application code has been deployed that uses the new
--          columns and does not use the dropped columns.
-- PRECONDITIONS:
--   - Backup verified (Supabase Dashboard → Backups / PITR available).
--   - Staging rehearsal completed successfully.
--   - Downtime or brief lock acceptable (ALTER + UPDATE + DROP).
-- ROLLBACK: Restore from Supabase backup/PITR to point before execution.
-- CONFIRMATION:
--   [ ] Staging run completed; schema and data match expectation.
--   [ ] Production backup verified.
--   [ ] Script executed in prod; no errors.
--   [ ] Post-verify: app uses new columns; no references to dropped columns.
-- =============================================================================

-- Consolidated migration: vella_settings language and schema fixes

begin;

alter table public.vella_settings
  add column if not exists language text;

update public.vella_settings vs
set language = p.app_language
from public.profiles p
where vs.user_id = p.id
  and vs.language is null
  and p.app_language is not null;

update public.vella_settings
set language = 'en'
where language is null;

alter table public.vella_settings
  add column if not exists relationship_mode text default 'companion',
  add column if not exists voice_hud jsonb default '{}'::jsonb;

alter table public.vella_settings
  drop column if exists story_mode,
  drop column if exists cadence,
  drop column if exists variability,
  drop column if exists sarcasm_softness,
  drop column if exists conversation_language;

commit;
