# Runbook SQL (Phase M1+)

This folder contains SQL intended for **manual or automated runbook execution** (audit, one-off fixes). It is separate from versioned migrations in `../migrations/`.

## Contents

- **001_migration_audit_table.sql** — Creates the `migration_audit` ledger table (metadata-only). Apply once per environment. If using migrations, the same DDL lives in `../migrations/` for apply order.
- **phase_m1_audit.sql** — Phase M1 audit query and optional RPC. Returns only counts and byte estimates; never selects user text. Safe to run repeatedly.

## Safety

- No query in this folder selects or returns user-generated text.
- All audit outputs are aggregates: counts, octet_length sums, min/max timestamps.
- RLS on `migration_audit` restricts access to service role and admin.

## How to run

- **Local:** Use Supabase CLI or any Postgres client connected with a role that can create tables/functions and insert into `migration_audit`.
- **Staging/Prod:** Run via your deployment or secrets-safe mechanism; pass environment name into the audit so the ledger row is tagged.
