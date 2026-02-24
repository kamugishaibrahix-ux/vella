# Phase M4.5 "Drop Legacy Content" — Plan of Attack

## Objective
Permanently remove schema surfaces that can store user free text. No columns in Supabase may hold user free text for these domains after this change.

## Files to Create

| File | Purpose |
|------|---------|
| `MOBILE/supabase/runbook-sql/phase_m4_5_drop_legacy_content.sql` | Runbook: DROP COLUMN IF EXISTS for each text column |
| `MOBILE/supabase/migrations/20260229_phase_m4_5_drop_legacy_content.sql` | Migration: same DROP COLUMNs; update purge/audit functions to handle missing columns |
| `MOBILE/scripts/checkNoServerTextColumns.mjs` | CI: scan migrations for forbidden column names / TEXT in user-domain tables |
| `MOBILE/test/migration/legacyDropped.test.ts` | Tests: safeTables excludes legacy content tables; export endpoints return deterministic error |

## Files to Modify

| File | Changes |
|------|---------|
| `MOBILE/lib/supabase/safeTables.ts` | Remove: `journal_entries`, `conversation_messages`, `check_ins`, `memory_chunks`, `user_reports`. Keep v2 and all non-legacy. |
| `MOBILE/lib/supabase/types.ts` | Remove or stub legacy table types (`journal_entries`, `check_ins`, `conversation_messages`, `memory_chunks`, `user_reports`, `user_nudges`) so Row/Insert/Update no longer expose text columns (or remove table entries if code no longer references them). |
| `MOBILE/app/api/migration/export/journals/route.ts` | Return 410 Gone with `error: "legacy_schema_dropped"` and no body text. |
| `MOBILE/app/api/migration/export/checkins/route.ts` | Same. |
| `MOBILE/app/api/migration/export/conversations/route.ts` | Same. |
| `MOBILE/app/api/migration/export/reports/route.ts` | Same. |
| `MOBILE/app/api/migration/export/memory/route.ts` | Either 410 or refactor to select only metadata (no content); memory export already selects no content — so keep selecting metadata columns only; after dropping `content`, select list stays valid. |
| `MOBILE/lib/migration/legacyCounts.ts` | Stop querying dropped tables: use v2-only or return false for legacy (has_legacy always false for dropped tables). |
| `MOBILE/lib/journal/db.ts` | Remove `fromSafe("journal_entries")` delete and hasLegacyJournalData; use v2 only or stub hasLegacy to false. |
| `MOBILE/lib/checkins/db.ts` | Remove `fromSafe("check_ins")` delete and hasLegacyCheckInsData; use v2 only or stub hasLegacy to false. |
| `MOBILE/lib/conversation/db.ts` | Remove listConversationMessagesLegacyForExport / hasLegacyConversationData or stub to empty/false; drop dependency on conversation_messages table. |
| `MOBILE/lib/memory/db.ts` | Stop selecting/inserting `content`; use metadata-only columns (content_hash, etc.); update types so content is optional/empty; listUnembeddedChunks/getRecentChunks return records with content "" or omit. |
| `MOBILE/package.json` | Add `checkNoServerTextColumns` to `check:data` script. |

## SQL Strategy

1. **Drop columns (IF EXISTS):**
   - `public.journal_entries`: title, content  
   - `public.conversation_messages`: content  
   - `public.check_ins`: note  
   - `public.memory_chunks`: content  
   - `public.user_reports`: summary, notes  
   - `public.user_nudges`: message  

2. **Do not drop tables.** Tables retain metadata (id, user_id, created_at, etc.) so existing RLS/counts that only need existence can be updated in app code to v2 or stubbed. Dropping tables would force removing all references at once; dropping only columns keeps tables for any remaining metadata use (e.g. run_phase_m4_audit_user still counting rows) and avoids FK issues.

3. **RPCs:**  
   - `run_phase_m4_purge`: Already uses per-table BEGIN/EXCEPTION; add `WHEN undefined_column THEN NULL` so purge is no-op once columns are gone.  
   - `run_phase_m4_audit_user`: Add `EXCEPTION WHEN undefined_column` per block; treat as 0 rows_with_text for that table.  
   - `run_phase_m1_audit`: Add `EXCEPTION WHEN undefined_column` (or skip legacy tables) so audit still runs.

## Export Routes

- **Journals, checkins, conversations, reports:** These SELECT text columns. After drop, queries would fail. **Return 410 Gone** with body `{ error: "legacy_schema_dropped" }` and do not perform the query.
- **Memory:** Already metadata-only select (no content). After dropping `memory_chunks.content`, select list stays valid. **Keep route**, ensure select list has no `content`.

## safeTables and Types

- **safeTables:** Remove legacy content table names so no new code can `fromSafe("journal_entries")` etc. Code that still referenced them will be updated to not use those tables (legacyCounts, journal/db, checkins/db, conversation/db, memory/db).
- **types.ts:** Remove or narrow legacy table definitions so that Row/Insert/Update do not include content/title/note/summary/notes/message (or remove table key if no longer used).

## CI Enforcement

- **checkNoServerTextColumns.mjs:**  
  - Scan all `**/supabase/migrations/*.sql` (and optionally runbook-sql) for:  
    - Forbidden column names: content, note, message, summary, title, transcript, prompt, response, narrative, description, body, comment, reflection, entry, reply, answer, reasoning.  
    - Creation of TEXT/VARCHAR columns in user-domain tables unless whitelisted (e.g. enum, code, hash ≤128 chars).  
  - Exit 1 if any match; otherwise 0.
- **check:data:** Run `node scripts/checkNoServerTextColumns.mjs` (or from repo root pointing at MOBILE).

## Tests

- safeTables does not include `journal_entries`, `conversation_messages`, `check_ins`, `memory_chunks`, `user_reports`.
- Export routes (journals, checkins, conversations, reports) return 410 with `error: "legacy_schema_dropped"` when called (with valid migration token if required).
- Memory export still returns 200 with metadata-only payload when schema has no content column.
- Migrations still run (no broken references to removed types in TS).

## Order of Operations

1. Implement SQL (runbook + migration) with DROP COLUMN IF EXISTS and RPC updates.  
2. Update app code: safeTables, types, legacyCounts, journal/db, checkins/db, conversation/db, memory/db, export routes.  
3. Add checkNoServerTextColumns.mjs and wire into check:data.  
4. Add tests.  
5. Run full check:data and migration tests.

---

## Verification Checklist (after deploy)

### SQL (run against DB)

```sql
-- 1) No text columns on legacy tables
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('journal_entries', 'conversation_messages', 'check_ins', 'memory_chunks', 'user_reports', 'user_nudges')
  AND column_name IN ('content', 'title', 'note', 'summary', 'notes', 'message');
-- Expect: 0 rows.

-- 2) Purge RPC runs without error (no-op when columns gone)
SELECT run_phase_m4_purge('<a-user-with-status-COMPLETED>'::uuid);
-- Expect: jsonb with status PURGED, tables.*.updated_rows (may be 0).
```

### App

- **GET /api/migration/status** — returns 200; `has_legacy` may be false for journals/checkins/conversations/reports; no forbidden keys in response.
- **GET /api/migration/export/journals** (with valid migration token) — returns **410** and `{ "error": "legacy_schema_dropped" }`. Same for checkins, conversations, reports.
- **GET /api/migration/export/memory** (with valid token) — returns 200 with metadata-only payload (no `content` field in rows).
- **Import pipeline** — when export returns 410, pipeline treats table as completed and continues; migration can complete.

### CI

- `pnpm test -- --run test/migration test/api/migrationPurge.test.ts test/api/migrationAuditNoText.test.ts` — all pass.
- `node scripts/checkNoServerTextColumns.mjs` — exit 0.
- `pnpm check:data` — passes (includes checkNoServerTextColumns).
