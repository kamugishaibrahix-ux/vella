# Runbook SQL (Supabase)

Manual, destructive or one-off SQL scripts live here. They are **not** applied by the migration runner.

- Destructive DDL (DROP TABLE, DROP COLUMN, TRUNCATE, etc.) must **never** go in `migrations/`; place them here and follow [docs/ops/MIGRATION_POLICY.md](../../docs/ops/MIGRATION_POLICY.md#runbook-sql).
- Execute only after staging rehearsal and backup verification; see [ROLLBACK_RUNBOOK.md](../../docs/ops/ROLLBACK_RUNBOOK.md).
