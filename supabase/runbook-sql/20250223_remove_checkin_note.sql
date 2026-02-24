-- =============================================================================
-- RUNBOOK SQL — Manual execution only. Do not place in migrations/.
-- =============================================================================
-- WHY:     Removes the `note` column from `public.checkins`. App no longer
--          uses this column; keeping it was redundant.
-- WHEN:    Run only after application code has been deployed that does not
--          read or write `checkins.note`. Prefer a maintenance window.
-- PRECONDITIONS:
--   - Backup verified (Supabase Dashboard → Backups / PITR available).
--   - Staging rehearsal completed successfully.
--   - Downtime or brief lock acceptable (ALTER TABLE DROP COLUMN).
-- ROLLBACK: Restore from Supabase backup/PITR to point before execution.
-- CONFIRMATION:
--   [ ] Staging run completed; schema matches expectation.
--   [ ] Production backup verified.
--   [ ] Script executed in prod; no errors.
--   [ ] Post-verify: app and queries do not reference checkins.note.
-- =============================================================================

DO $$

BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'checkins'
    ) THEN
        ALTER TABLE public.checkins DROP COLUMN IF EXISTS note;
    END IF;
END $$;
