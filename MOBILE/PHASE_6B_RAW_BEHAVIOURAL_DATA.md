# Phase 6B — Durable Raw Behavioural Data Layer

Journal, check-ins, and conversation messages are stored in Supabase. The engine reads only from DB. No localStorage as source of truth for these domains.

---

## Migration

**File:** `MOBILE/supabase/migrations/20260219_raw_behavioural_tables.sql`

### Tables

1. **journal_entries**
   - `id` uuid PK, `user_id` uuid FK auth.users, `title` text, `content` text NOT NULL, `created_at`, `updated_at` timestamptz
   - Index: `(user_id, created_at DESC)`

2. **check_ins**
   - `id` uuid PK, `user_id` uuid FK, `entry_date` date NOT NULL, `mood`/`stress`/`energy`/`focus` smallint, `note` text, `created_at` timestamptz
   - Index: `(user_id, entry_date DESC)`

3. **conversation_messages**
   - `id` uuid PK, `user_id` uuid FK, `role` text CHECK (user|assistant), `content` text NOT NULL, `session_id` uuid, `created_at` timestamptz
   - Indexes: `(user_id, created_at DESC)`, `(user_id, session_id, created_at)`

**RLS:** All three tables: SELECT / INSERT / UPDATE / DELETE only where `auth.uid() = user_id`.

---

## API routes (server authoritative)

| Method | Route | Description |
|--------|--------|-------------|
| GET | /api/journal | List journal entries from DB (listJournalEntries → journal_entries) |
| POST | /api/journal | Create entry in journal_entries |
| PUT | /api/journal | Update entry in journal_entries |
| PATCH | /api/journal | Retry enrichment; update in journal_entries |
| GET | /api/check-ins | List check-ins from DB |
| POST | /api/check-ins | Create check-in in check_ins |
| PATCH | /api/check-ins | Update check-in |
| DELETE | /api/check-ins | Delete check-in (?id=uuid) |
| POST | /api/vella/text | Persists user + assistant messages to conversation_messages after each turn |
| POST | /api/reflection | No change; receives payload in body (no direct local read) |

No route reads from localStorage for journal, check-ins, or conversation messages.

---

## Server data layer

- **Journal:** `lib/journal/db.ts` — listJournalEntriesFromDb, getJournalEntryFromDb, createJournalEntryInDb, updateJournalEntryInDb, deleteJournalEntryInDb. `lib/journal/server.ts` uses these (no journalLocal writes).
- **Check-ins:** `lib/checkins/db.ts` — listCheckInsFromDb, getCheckInFromDb, createCheckInInDb, updateCheckInInDb, deleteCheckInInDb. `lib/checkins/getAllCheckIns.ts` uses listCheckInsFromDb.
- **Conversation:** `lib/conversation/db.ts` — listConversationMessagesFromDb, getConversationMessageCount, insertConversationMessage. Used by `/api/vella/text` (persist turn) and `lib/connection/depthEngine.ts` (countUserMessages).

---

## recomputeState (Phase 6B)

**File:** `lib/engine/behavioural/recomputeState.ts`

Reads from Supabase only:

- profiles, vella_settings, subscriptions (existence/plan)
- **journal_entries** — count in window → `progress.journal_count`, `metadata.sources`
- **check_ins** — count in window → `progress.checkin_count`
- **conversation_messages** — count in window → `progress.message_count`
- **user_goals** — count → `progress.goals_count`

Deterministic aggregates: no LLM, no embeddings. `connection_depth` = min(10, floor(message_count / 5)). State schema unchanged (traits, themes, loops, distortions, progress, connection_depth, regulation, metadata).

---

## Local persistence (no-ops)

- **journalLocal:** createLocalJournal, updateLocalJournal, deleteLocalJournal are no-ops. listLocalJournals / getLocalJournal still read from localStorage (migration/compat only).
- **checkinsLocal:** saveCheckin, saveCheckinNote, deleteCheckin are no-ops. loadCheckins / loadCheckinNotes still read from localStorage (compat only).
- **conversationLocal:** saveLocalMessage is no-op. getLocalRecentMessages / getLocalFullHistory still read from localStorage. Summary and memory profile still written locally (no DB table yet).

---

## Verification checklist

- [ ] `pnpm run build` exits 0
- [ ] Journal POST creates row in journal_entries; GET lists DB rows
- [ ] Check-ins POST creates row in check_ins; GET lists DB rows
- [ ] Conversation: POST /api/vella/text persists user + assistant messages in conversation_messages
- [ ] recomputeState produces non-empty deterministic state (progress.journal_count, checkin_count, message_count, connection_depth)
- [ ] behavioural_state_current updates after POST /api/state/recompute
- [ ] No API route reads journal/check-ins/conversation from localStorage
