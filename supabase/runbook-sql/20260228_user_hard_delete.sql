-- ==========================================================================
-- GDPR: User Hard Delete Runbook
-- ==========================================================================
-- PURPOSE: Delete all user-scoped data for a single user.
-- WHEN: User requests account deletion (GDPR Art. 17 "Right to Erasure").
--
-- PRECONDITIONS:
--   1. Confirm user identity and deletion request via support channel.
--   2. Ensure local device data has been wiped (client-side responsibility).
--   3. Take a DB snapshot/backup before running (Supabase Dashboard → Backups).
--   4. Run in staging first.
--
-- POLICY:
--   - User-scoped rows: DELETE (CASCADE handles most via FK).
--   - Admin audit logs: ANONYMIZE user reference (retain for compliance).
--   - Financial records: ANONYMIZE identity but retain transaction data (7yr).
--   - auth.users row: DELETE last (triggers CASCADE on profiles FK).
--
-- ROLLBACK: Restore from PITR backup.
-- ==========================================================================

-- Usage: Replace $1 with the user UUID, then execute each block in order.
-- In psql: \set target_user_id '00000000-0000-0000-0000-000000000000'
-- Then run: \i 20260228_user_hard_delete.sql

-- -----------------------------------------------------------------------
-- STEP 0: Preflight — confirm user exists and gather summary
-- -----------------------------------------------------------------------
DO $$
DECLARE
  v_user_id uuid := :'target_user_id';
  v_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_user_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'User % does not exist in auth.users', v_user_id;
  END IF;
  RAISE NOTICE 'User % found. Proceeding with deletion.', v_user_id;
END $$;

-- -----------------------------------------------------------------------
-- STEP 1: Delete MOBILE user-scoped data (most have ON DELETE CASCADE)
-- -----------------------------------------------------------------------

-- Governance / behavioural (CASCADE from auth.users → commitments, etc.)
DELETE FROM public.behaviour_events WHERE user_id = :'target_user_id';
DELETE FROM public.commitments WHERE user_id = :'target_user_id';
DELETE FROM public.abstinence_targets WHERE user_id = :'target_user_id';
DELETE FROM public.focus_sessions WHERE user_id = :'target_user_id';
DELETE FROM public.governance_state WHERE user_id = :'target_user_id';

-- Behavioural state
DELETE FROM public.behavioural_state_history WHERE user_id = :'target_user_id';
DELETE FROM public.behavioural_state_current WHERE user_id = :'target_user_id';

-- Memory system
DELETE FROM public.memory_embed_jobs WHERE user_id = :'target_user_id';
DELETE FROM public.memory_clusters WHERE user_id = :'target_user_id';
DELETE FROM public.memory_snapshots WHERE user_id = :'target_user_id';
DELETE FROM public.memory_chunks_v2 WHERE user_id = :'target_user_id';
DELETE FROM public.memory_chunks WHERE user_id = :'target_user_id';

-- Content v2 (metadata-only tables)
DELETE FROM public.journal_entries_v2 WHERE user_id = :'target_user_id';
DELETE FROM public.conversation_metadata_v2 WHERE user_id = :'target_user_id';
DELETE FROM public.check_ins_v2 WHERE user_id = :'target_user_id';
DELETE FROM public.user_reports_v2 WHERE user_id = :'target_user_id';

-- Legacy content tables (rows may exist if M4.5 not yet applied)
DELETE FROM public.journal_entries WHERE user_id = :'target_user_id';
DELETE FROM public.conversation_messages WHERE user_id = :'target_user_id';
DELETE FROM public.check_ins WHERE user_id = :'target_user_id';

-- Migration system
DELETE FROM public.migration_state WHERE user_id = :'target_user_id';

-- Webhook events (system table, no user_id — skip)

-- -----------------------------------------------------------------------
-- STEP 2: Delete root user-scoped data
-- -----------------------------------------------------------------------

-- Feature / progress tables
DELETE FROM public.micro_rag_cache WHERE user_id = :'target_user_id';
DELETE FROM public.social_models WHERE user_id = :'target_user_id';
DELETE FROM public.vella_personality WHERE user_id = :'target_user_id';
DELETE FROM public.progress_metrics WHERE user_id = :'target_user_id';
DELETE FROM public.connection_depth WHERE user_id = :'target_user_id';

-- User traits
DELETE FROM public.user_traits_history WHERE user_id = :'target_user_id';
DELETE FROM public.user_traits WHERE user_id = :'target_user_id';

-- Settings / preferences
DELETE FROM public.user_preferences WHERE user_id = :'target_user_id';
DELETE FROM public.vella_settings WHERE user_id = :'target_user_id';

-- Feedback
DELETE FROM public.feedback WHERE user_id = :'target_user_id';

-- Token usage (non-financial operational data)
DELETE FROM public.token_usage WHERE user_id = :'target_user_id';

-- Nudges (if table exists)
DO $$ BEGIN
  DELETE FROM public.user_nudges WHERE user_id = :'target_user_id';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Conversation sessions
DELETE FROM public.conversation_sessions WHERE user_id = :'target_user_id';

-- Admin user flags
DELETE FROM public.admin_user_flags WHERE user_id = :'target_user_id';

-- -----------------------------------------------------------------------
-- STEP 3: Anonymize financial records (retain for 7yr regulatory)
-- -----------------------------------------------------------------------

-- Token topups: detach identity but keep transaction records
UPDATE public.token_topups
SET user_id = '00000000-0000-0000-0000-000000000000'
WHERE user_id = :'target_user_id';

-- Token ledger: anonymize
UPDATE public.token_ledger
SET user_id = '00000000-0000-0000-0000-000000000000'
WHERE user_id = :'target_user_id';

-- Subscriptions: anonymize but retain Stripe IDs for reconciliation
UPDATE public.subscriptions
SET user_id = '00000000-0000-0000-0000-000000000000',
    status = 'deleted'
WHERE user_id = :'target_user_id';

-- -----------------------------------------------------------------------
-- STEP 4: Anonymize admin references
-- -----------------------------------------------------------------------

-- Admin activity log: replace target_user_id with hash, keep audit trail
-- Note: admin_activity_log may not have target_user_id column in all schemas;
-- the next/previous JSONB may contain user references.
UPDATE public.admin_activity_log
SET previous = previous - 'user_id' || jsonb_build_object('user_id_deleted', true),
    next = next - 'user_id' || jsonb_build_object('user_id_deleted', true)
WHERE previous::text LIKE '%' || :'target_user_id' || '%'
   OR next::text LIKE '%' || :'target_user_id' || '%';

-- System logs: anonymize user_id
UPDATE public.system_logs
SET user_id = NULL
WHERE user_id = :'target_user_id';

-- User metadata: delete (admin-managed, not needed after deletion)
DELETE FROM public.user_metadata WHERE user_id = :'target_user_id';

-- User reports (moderation): anonymize
UPDATE public.user_reports
SET user_id = '00000000-0000-0000-0000-000000000000'
WHERE user_id = :'target_user_id';

-- -----------------------------------------------------------------------
-- STEP 5: Delete profile (triggers remaining CASCADEs)
-- -----------------------------------------------------------------------
DELETE FROM public.profiles WHERE id = :'target_user_id';

-- -----------------------------------------------------------------------
-- STEP 6: Delete auth user (final step — triggers auth.users CASCADE)
-- -----------------------------------------------------------------------
-- This must be done via Supabase Admin API or Dashboard, not direct SQL.
-- DELETE FROM auth.users WHERE id = :'target_user_id';
-- Use instead: supabase.auth.admin.deleteUser(target_user_id)

-- -----------------------------------------------------------------------
-- STEP 7: Verification
-- -----------------------------------------------------------------------
DO $$
DECLARE
  v_user_id uuid := :'target_user_id';
  v_count bigint := 0;
BEGIN
  -- Check no rows remain in key tables
  SELECT count(*) INTO v_count FROM public.profiles WHERE id = v_user_id;
  IF v_count > 0 THEN RAISE WARNING 'profiles still has % rows', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.user_metadata WHERE user_id = v_user_id;
  IF v_count > 0 THEN RAISE WARNING 'user_metadata still has % rows', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.behavioural_state_current WHERE user_id = v_user_id;
  IF v_count > 0 THEN RAISE WARNING 'behavioural_state_current still has % rows', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.governance_state WHERE user_id = v_user_id;
  IF v_count > 0 THEN RAISE WARNING 'governance_state still has % rows', v_count; END IF;

  RAISE NOTICE 'Verification complete for user %', v_user_id;
END $$;
