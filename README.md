# MindCompass

## Data Design & Storage Model

For details of what data is stored where, see [DATA_DESIGN.md](./DATA_DESIGN.md).

## Rollback Readiness

- **[Rollback Runbook](docs/ops/ROLLBACK_RUNBOOK.md)** — When and how to roll back code (Vercel) and data (Supabase); RTO ≤ 15 min; decision tree and post-rollback validation.
- **[Migration Policy](docs/ops/MIGRATION_POLICY.md)** — Backwards-compatible migration rules, staging procedure, and handling of enums/RLS. CI blocks destructive statements in migrations (see `scripts/check-migrations-safe.mjs`).


