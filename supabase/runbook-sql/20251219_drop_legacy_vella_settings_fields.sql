-- =============================================================================
-- RUNBOOK SQL — Manual execution only. Do not place in migrations/.
-- =============================================================================
-- WHY:     Drops legacy columns from vella_settings (cadence, variability,
--          sarcasm_softness) that are no longer used by the application.
-- WHEN:    Run only after application code has been deployed that does not
--          read or write these columns.
-- PRECONDITIONS:
--   - Backup verified (Supabase Dashboard → Backups / PITR available).
--   - Staging rehearsal completed successfully.
--   - Downtime or brief lock acceptable (ALTER TABLE DROP COLUMN).
-- ROLLBACK: Restore from Supabase backup/PITR to point before execution.
-- CONFIRMATION:
--   [ ] Staging run completed; schema matches expectation.
--   [ ] Production backup verified.
--   [ ] Script executed in prod; no errors.
--   [ ] Post-verify: app does not reference dropped columns.
-- =============================================================================

-- Drop legacy Vella settings columns that are no longer used
ALTER TABLE vella_settings
  DROP COLUMN IF EXISTS cadence,
  DROP COLUMN IF EXISTS variability,
  DROP COLUMN IF EXISTS sarcasm_softness;
