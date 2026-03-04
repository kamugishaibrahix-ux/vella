# Data Retention and Deletion Policy — Vella Platform

## Principles

1. **Local-first**: User-generated content (journals, messages, check-in notes, voice transcripts) is stored only on the user's device.
2. **Minimal server storage**: Supabase stores only safe metadata (IDs, scores, hashes, timestamps, enum codes, boolean flags).
3. **Right to erasure**: Users can request deletion of all server-side data (GDPR Art. 17).
4. **Financial record retention**: Transaction records are anonymized but retained for 7 years per regulatory requirements.

---

## Retention Schedule

| Data Category | Retention | Deletion Trigger | Method |
|---------------|-----------|------------------|--------|
| **User profile** | Account lifetime | Account deletion request | Hard delete |
| **Preferences / settings** | Account lifetime | Account deletion request | Hard delete (CASCADE) |
| **Behavioural state** | Account lifetime | Account deletion request | Hard delete |
| **Governance data** | Account lifetime | Account deletion request | Hard delete |
| **Memory metadata** | Account lifetime | Account deletion request | Hard delete |
| **Progress metrics** | Account lifetime | Account deletion request | Hard delete |
| **Feedback** | Account lifetime | Account deletion request | Hard delete |
| **Token usage** | Account lifetime | Account deletion request | Hard delete |
| **Subscriptions** | 7 years (financial) | Account deletion request | Anonymize (detach identity) |
| **Token topups** | 7 years (financial) | Account deletion request | Anonymize (detach identity) |
| **Token ledger** | 7 years (financial) | Account deletion request | Anonymize (detach identity) |
| **Admin audit logs** | Indefinite (compliance) | N/A | Anonymize user references |
| **System logs** | 90 days rolling | Automated cleanup | NULL user_id on deletion |
| **Webhook events** | 90 days rolling | Automated cleanup | No user reference |
| **Migration state** | Account lifetime | Account deletion request | Hard delete |

---

## User Deletion Procedure

### Prerequisites
1. Verify user identity and deletion request via authenticated support channel.
2. Inform user that local device data must be cleared separately (app uninstall or in-app "clear data").
3. Take a Supabase backup (Dashboard → Backups / PITR).
4. Run deletion in staging first.

### Execution
Run: `supabase/runbook-sql/20260228_user_hard_delete.sql`

Set `target_user_id` to the user's UUID.

### Steps (automated by runbook)

| Step | Action | Tables Affected |
|------|--------|-----------------|
| 0 | Preflight: confirm user exists | auth.users |
| 1 | Delete MOBILE user data | behaviour_events, commitments, abstinence_targets, focus_sessions, governance_state, behavioural_state_*, memory_*, journal_entries_v2, conversation_metadata_v2, check_ins_v2, user_reports_v2, legacy content tables, migration_state |
| 2 | Delete root user data | micro_rag_cache, social_models, vella_personality, progress_metrics, connection_depth, user_traits*, user_preferences, vella_settings, feedback, token_usage, user_nudges, conversation_sessions, admin_user_flags |
| 3 | Anonymize financial records | token_topups, token_ledger, subscriptions (set user_id to nil UUID, status to 'deleted') |
| 4 | Anonymize admin references | admin_activity_log (strip user_id from JSONB), system_logs (NULL user_id), user_metadata (delete), user_reports (anonymize) |
| 5 | Delete profile | profiles (triggers remaining CASCADEs) |
| 6 | Delete auth user | Via Supabase Admin API: `supabase.auth.admin.deleteUser(userId)` |
| 7 | Verification | Confirm no rows remain in key tables |

### Post-deletion
- Confirm deletion via verification step output.
- Send deletion confirmation to user.
- Log deletion in admin activity log (anonymized).

---

## Tables by Deletion Strategy

### Hard Delete (all rows for user)
```
profiles, user_preferences, vella_settings, user_traits, user_traits_history,
progress_metrics, connection_depth, micro_rag_cache, social_models,
vella_personality, behavioural_state_current, behavioural_state_history,
governance_state, behaviour_events, commitments, abstinence_targets,
focus_sessions, memory_chunks, memory_chunks_v2, memory_embed_jobs,
memory_snapshots, memory_clusters, journal_entries_v2, conversation_metadata_v2,
check_ins_v2, user_reports_v2, feedback, token_usage, conversation_sessions,
admin_user_flags, migration_state, user_nudges, user_metadata
```

### Anonymize (detach identity, retain records)
```
subscriptions → set user_id to nil UUID, status to 'deleted'
token_topups → set user_id to nil UUID
token_ledger → set user_id to nil UUID
admin_activity_log → strip user references from JSONB
system_logs → NULL user_id
user_reports → set user_id to nil UUID
```

### No Action (system tables without user scope)
```
webhook_events, migration_audit, migration_export_audit,
admin_ai_config, admin_global_config, analytics_counters,
token_rates, promo_codes, tier_corruption_quarantine
```
