# Phase M4 Purge Runbook

Safe, gated, auditable purge of legacy server-side text content **only after** user migration is completed. No user text is ever selected, logged, or returned.

## Preconditions

1. **Migration must be COMPLETED for the user.**  
   `run_phase_m4_purge(p_user_id)` checks `migration_state.status = 'COMPLETED'` for that user. If not, it raises `MIGRATION_NOT_COMPLETED` (SQLSTATE P0002) and no rows are modified.

2. **Irreversibility.**  
   Purgation sets text columns to `NULL`. It cannot be undone. **Take a database snapshot or backup before running purge** if you may need to recover.

3. **Execution context.**  
   The function is `SECURITY DEFINER` and is callable only by `service_role`. Application roles (`anon`, `authenticated`) cannot execute it.

## Tables and columns purged

| Table                  | Columns set to NULL                    |
|------------------------|----------------------------------------|
| `journal_entries`      | `content`, `title`                     |
| `conversation_messages`| `content`                              |
| `check_ins`            | `note`                                 |
| `memory_chunks`        | `content`                              |
| `user_reports`         | `summary`, `notes`                     |
| `user_nudges`          | `message`                              |

If a table does not exist in the environment, that step is skipped (no error).

## How to run the RPC safely

### Option 1: SQL (runbook)

1. Apply the runbook SQL (creates/updates the function):
   ```bash
   psql $DATABASE_URL -f supabase/runbook-sql/phase_m4_purge.sql
   ```
   Or ensure the migration `20260227_phase_m4_purge.sql` has been applied.

2. Run purge for a single user:
   ```sql
   SELECT run_phase_m4_purge('<user_id>'::uuid);
   ```

3. Example output (metadata only; no user text):
   ```json
   {
     "user_id": "<uuid>",
     "status": "PURGED",
     "tables": {
       "journal_entries": { "updated_rows": 5 },
       "conversation_messages": { "updated_rows": 12 },
       "check_ins": { "updated_rows": 2 },
       "memory_chunks": { "updated_rows": 0 },
       "user_reports": { "updated_rows": 0 },
       "user_nudges": { "updated_rows": 1 }
     },
     "totals": { "total_updated_rows": 20 }
   }
   ```

### Option 2: Internal API (service/cron only)

- **Endpoint:** `POST /api/internal/migration/purge`
- **Auth:** Header `x-cron-secret` or `Authorization: Bearer <secret>` must match `MIGRATION_PURGE_CRON_SECRET` (or `CRON_SECRET`).
- **Body:** `{ "user_id": "<uuid>" }`
- **Success (200):** JSON with `request_id`, `user_id`, `status`, `tables`, `totals` (counts only).
- **403:** `{ "error": "MIGRATION_NOT_COMPLETED", "request_id": "..." }` — migration not completed for that user; no rows were modified.

Example:
```bash
curl -X POST "https://<host>/api/internal/migration/purge" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $MIGRATION_PURGE_CRON_SECRET" \
  -d '{"user_id":"<uuid>"}'
```

## Expected outputs

- **Success:** `status: "PURGED"`, `tables` with `updated_rows` per table, `totals.total_updated_rows`.
- **Gate failure:** RPC raises `MIGRATION_NOT_COMPLETED`; API returns 403 with `error: "MIGRATION_NOT_COMPLETED"`.
- **No text in response:** Responses contain only counts and identifiers (e.g. `user_id`, `request_id`). No `content`, `note`, `summary`, `title`, `message`, or other user text.

## Verification after purge

To confirm a user has no remaining text in legacy tables (e.g. after purge):

```sql
SELECT run_phase_m4_audit_user('<user_id>'::uuid);
```

Expect `totals.total_rows_with_text` to be 0 and each `tables.<table>.rows_with_text` to be 0. The function `run_phase_m4_audit_user` is defined in migration `20260228_phase_m4_audit_user.sql` and is service_role-only.

## Rollback note

**Purgation is irreversible.** Text columns are set to `NULL` and are not stored elsewhere by this process. Before running purge in production:

1. Ensure migration (export + local persistence) is complete and verified for affected users.
2. Take a database snapshot or backup if you need the option to restore.
3. Run per user or in batches; use the returned counts to audit.

## Privileges

- `REVOKE EXECUTE ON FUNCTION public.run_phase_m4_purge(uuid)` from `PUBLIC`, `anon`, `authenticated`.
- `GRANT EXECUTE ON FUNCTION public.run_phase_m4_purge(uuid) TO service_role`.

Only the service role (e.g. Supabase service role key or the internal API with cron secret) can execute the purge.
