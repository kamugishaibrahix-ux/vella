# Backend Compliance & Wiring Plan (Strict Rules-First)

**Rule:** Supabase stores SAFE METADATA ONLY. No personal or free-text user data. Local storage (client) is the only place for personal/free-text content. Backend may store only derived aggregates, scores, counters, timestamps, hashes, non-sensitive flags.

**Mode:** Read-only analysis. No code modified until the plan is approved. All claims backed by file paths and line references.

---

## A) VIOLATIONS REPORT

Table: code paths that **write** personal or free-text data into Supabase.

| # | File path | Function / entry point | Table(s) and columns written | Violates? | Evidence |
|---|-----------|------------------------|------------------------------|------------|----------|
| 1 | `lib/journal/db.ts` | `createJournalEntryInDb` (lines 58–76) | `journal_entries`: `title`, `content` | **Yes** | Insert payload: `title: input.title ?? null`, `content: input.content` (user-supplied text). Called by `lib/journal/server.ts` line 46 `createJournalEntry(userId, { title, content })`. |
| 2 | `lib/journal/db.ts` | `updateJournalEntryInDb` (lines 78–96) | `journal_entries`: `title`, `content` | **Yes** | Updates `updates.title`, `updates.content` from patch. Called by `lib/journal/server.ts` line 58 `updateJournalEntryInDb(userId, id, { content })`. |
| 3 | `app/api/journal/route.ts` | POST (lines 59–109), PUT (111–162), PATCH (164–215) | — | **Yes** | POST: `createJournalEntry(userId, text, title, ...)` with `text`, `title` from `journalCreateSchema`/`journalUpdateSchema`. PUT/PATCH: `updateJournalEntry(..., text, ...)`. All persist via server → db. |
| 4 | `lib/conversation/db.ts` | `insertConversationMessage` (lines 57–73) | `conversation_messages`: `content` | **Yes** | Insert: `content: message.content` (user or assistant message text). |
| 5 | `app/api/vella/text/route.ts` | POST (lines 84–199) | — | **Yes** | Line 127: `insertConversationMessage(userId, { role: "user", content: text, ... })`. Line 128: same with `content: exerciseReply`. Line 152: same with `content: text`. Line 187: `content: reply`. All write free-text to `conversation_messages`. |
| 6 | `lib/checkins/db.ts` | `createCheckInInDb` (lines 64–90) | `check_ins`: `note` | **Yes** | Insert: `note: input.note ?? null` (user-written note). |
| 7 | `lib/checkins/db.ts` | `updateCheckInInDb` (lines 92–115) | `check_ins`: `note` | **Yes** | Updates include `patch.note`. |
| 8 | `app/api/check-ins/route.ts` | POST (lines 83–90), PATCH (121–127) | — | **Yes** | POST: `createCheckInInDb(userId, parsed.data)` where schema allows `note`. PATCH: `updateCheckInInDb(userId, id, patch)` where patch can include `note`. |
| 9 | `lib/memory/db.ts` | `upsertChunksForSource` (lines 44–70) | `memory_chunks`: `content` | **Yes** | Rows include `content: trimContent(c.content)` — chunk text from journal/conversation/snapshot. |
| 10 | `app/api/memory/chunk/route.ts` | POST (lines 29–75) | — | **Yes** | Lines 47–51: reads `journal_entries.title`, `journal_entries.content`; 54–66: reads `conversation_messages.role`, `content`; 69–72: reads `behavioural_state_history.state_json`. Builds chunks with that content and calls `upsertChunksForSource` (line 77) → writes `memory_chunks.content`. |
| 11 | `app/api/memory/reindex/route.ts` | POST (lines 31–109) | — | **Yes** | Lines 53–60: reads journal `title`, `content`, chunkJournal → upsertChunksForSource. Lines 64–80: reads conversation `content`, chunkConversation → upsertChunksForSource. Lines 84–92: reads state_json, chunkSnapshot → upsertChunksForSource. All write `memory_chunks.content`. |
| 12 | `app/api/reports/create/route.ts` | POST (lines 17–56) | `user_reports`: `summary`, `notes` | **Yes** | Insert (lines 36–45): `summary: body.summary` (user string 1–2000 chars), `notes: null`. |
| 13 | `lib/engine/behavioural/recomputeState.ts` | `recomputeState` (lines 66–177) | `behavioural_state_current`: `state_json`; `behavioural_state_history`: `state_json` | **No** | state_json contains only: `progress` (journal_count, checkin_count, message_count, goals_count), `connection_depth`, `metadata` (window_start, window_end, sources). No user text. traits/themes/loops/distortions are EMPTY_STATE. |

**Summary:** Violations are: **journal_entries** (title, content), **conversation_messages** (content), **check_ins** (note), **memory_chunks** (content), **user_reports** (summary, and notes if ever set). **profiles**: `lib/profile/upsertProfile.ts` is a no-op (lines 15–18); no Supabase write from this codebase. If profiles are written elsewhere (e.g. Auth), `display_name` is PII and should be treated as MODIFY for full compliance.

---

## B) DB COMPLIANCE PATCH PLAN

Minimum set of changes to comply with “Supabase = safe metadata only.”

### Table-level decisions

| Table | Decision | Action |
|-------|----------|--------|
| **journal_entries** | **DELETE** or **MODIFY** | **Option A (DELETE):** Drop table; journal lives only in local storage; server never stores title/content. **Option B (MODIFY):** Remove `title`, `content`; add only `user_id`, `local_entry_id_hash` (SHA256 of client-provided id), `created_at`, `updated_at`, optional `word_count`, `entry_date`. No text. |
| **conversation_messages** | **DELETE** | Drop table. Conversation history is client-held only; server receives last N messages in request body and does not persist them. |
| **check_ins** | **MODIFY** | Keep table. **Remove column:** `note`. Keep: `user_id`, `id`, `entry_date`, `mood`, `stress`, `energy`, `focus`, `created_at`. Optional: add `note_length` (integer) or `has_note` (boolean) if needed for aggregates only. |
| **memory_chunks** | **DELETE** | Drop table (and dependent `memory_embed_jobs`). Memory/chunking/embedding becomes client-side or out-of-band; server does not store chunk content or embeddings. Retrieval for /api/vella/text uses only client-supplied “memory summary” in the request. |
| **memory_embed_jobs** | **DELETE** | Drop with memory_chunks (references memory_chunks). |
| **user_reports** | **MODIFY** | **Remove or replace:** `summary` → store only `summary_hash` (SHA256) and/or `category` (enum), `severity` (enum). Or move reports to a non-Supabase pipeline; if kept in DB, no free-text. |
| **behavioural_state_current** | **KEEP** | Already safe: only counts, connection_depth, metadata. Ensure no future code writes themes/loops/distortions as raw user text; if populated, they must be derived labels/enums only. |
| **behavioural_state_history** | **KEEP** | Same as current; state_json must remain derived-only. |
| **profiles** | **MODIFY** (if written anywhere) | **Remove or replace:** `display_name` → do not store; or store only `display_name_hash` for dedup. Prefer not storing name at all. |
| **feedback** | **KEEP** | Types and insert in `app/api/feedback/create/route.ts` (lines 39–44) do not write a message column; only rating, session_id, channel, category. No change if table matches. |
| **user_goals** | **KEEP or MODIFY** | Types show `type`, `status` (strings). If they are enums only (life/focus/weekly; active/completed), keep. If any goal title/description is stored in Supabase, remove those columns. Current `lib/goals/goalEngine.ts` uses serverLocal only; recomputeState only counts user_goals. If Supabase user_goals has title/description columns, MODIFY to remove them. |

### Migrations to add (conceptual; apply in order)

1. **Stop writing free-text (application change first)**  
   - Remove or redirect all calls that insert/update: journal_entries (title, content), conversation_messages (content), check_ins (note), memory_chunks (content), user_reports (summary/notes).  
   - Implement “safe” alternatives: e.g. journal and conversation only in client; check_ins without note (or only has_note/note_length); reports without summary text; no memory_chunks writes.

2. **Migration: check_ins**  
   - `ALTER TABLE check_ins DROP COLUMN IF EXISTS note;`  
   - Optionally add `note_length INT DEFAULT NULL` or `has_note BOOLEAN DEFAULT FALSE` for aggregates.

3. **Migration: user_reports**  
   - `ALTER TABLE user_reports DROP COLUMN IF EXISTS summary;`  
   - Optionally add `summary_hash TEXT` (SHA256 hex), and/or restrict to enum columns only.  
   - If `notes` exists and is ever written, drop or replace similarly.

4. **Migration: journal_entries**  
   - **If DELETE:** `DROP TABLE IF EXISTS journal_entries CASCADE;`  
   - **If MODIFY:** `ALTER TABLE journal_entries DROP COLUMN IF EXISTS title, DROP COLUMN IF EXISTS content;` then add safe columns (e.g. `local_entry_id_hash TEXT`, `word_count INT`, `entry_date DATE`) as needed. Application must stop writing title/content before this.

5. **Migration: conversation_messages**  
   - `DROP TABLE IF EXISTS conversation_messages CASCADE;`  
   - Application must not reference this table for reads/writes; all history from client.

6. **Migration: memory_chunks + memory_embed_jobs**  
   - `DROP TABLE IF EXISTS memory_embed_jobs CASCADE;`  
   - `DROP TABLE IF EXISTS memory_chunks CASCADE;`  
   - Remove or replace any code that reads/writes these tables.

7. **Migration: profiles (if applicable)**  
   - If display_name must not be stored: `ALTER TABLE profiles DROP COLUMN IF EXISTS display_name;` or add `display_name_hash` and stop storing plain name. Coordinate with Auth if it writes profiles.

---

## C) ROUTE WIRING PLAN: /api/vella/text and the mode system

### Current state (from code)

- **`/api/vella/text`** (`app/api/vella/text/route.ts`):  
  - Uses **only** `buildVellaTextPrompt` (lib/ai/textPrompts.ts) and `runVellaTextCompletion` (lib/ai/textEngine.ts).  
  - Does **not** call `runConversationalGuide` (lib/ai/agents.ts).  
  - Does **not** use: ConversationMode, RELATIONSHIP_MODES, TONE_PROFILES, VellaPersonaMode, buildModeSystemPrompt, buildPersonaInstruction, or trait hints.  
  - Reads **server-side** memory via `retrieveTopK` (lib/memory/retrieve.ts) and injects into prompt; no mode or relationship in that path.  
  - **Writes** user and assistant message to `conversation_messages` (violation; must stop under compliance).

- **Mode systems unused by /api/vella/text:**  
  - **RELATIONSHIP_MODES** (personaConfig.ts): used by buildPersonaInstruction (realtime/reflection), not by vella/text.  
  - **TONE_PROFILES** (persona/toneProfiles.ts): used in agents/realtime, not by vella/text.  
  - **ConversationMode** (agents.ts): only applied in buildModeSystemPrompt inside runConversationalGuide; runConversationalGuide is not called from vella/text.  
  - **VellaPersonaMode** (agents.ts): used for lite fallback and absence message; vella/text does not use lite or absence.

### Target: orchestration inside /api/vella/text (no server-stored conversation)

- **Inputs (all from request body or derived on server from safe state):**  
  - `message` (current user message).  
  - `language` (optional).  
  - `session_id` (optional; for idempotency or logging only, not for loading history).  
  - **Client-supplied:** `history` (array of `{ role, content }`, last N turns, e.g. last 5–10).  
  - **Client-supplied (optional):** `memory_summary` (string, precomputed on client from local memory; no server-side retrieval from DB).  
  - **Server-read (safe only):** `behavioural_state_current` (e.g. connection_depth, progress counts) from GET state or recompute; optional trait scores if computed from safe signals only.

- **No server-stored conversation:**  
  - Do not read from or write to `conversation_messages`.  
  - Do not call `retrieveTopK` (that reads memory_chunks, which is removed).  
  - Memory context for the prompt = client-provided `memory_summary` only (if present).

### Orchestration steps (to implement in /api/vella/text)

1. **Parse and validate body**  
   - Extend schema with optional `history` (array of `{ role: "user"|"assistant", content: string }`, max length and content length per element), optional `memory_summary` (string, max length), optional `preferred_mode` (enum: default | deep_reflection | execution_coach | stoic_mentor | clarity_mode | behaviour_analysis | mindset_reset).  
   - Enforce SAFE PAYLOAD CONTRACT (see D): no other free-form text fields; no sending of journal/check-in raw content in history beyond the last N conversation turns.

2. **Resolve ConversationMode**  
   - If client sends `preferred_mode` and it’s allowed for the user’s tier (tierCheck), use it.  
   - Else: compute from **intent** of the latest user message.  
     - Use `determineIntent(latestUserMessage)` (lib/ai/intent/router.ts) — can stay as-is (rules + optional LLM).  
     - Map intent to mode, e.g.: EMOTIONAL_SUPPORT → default or deep_reflection; PHILOSOPHY → stoic_mentor; UNKNOWN + keywords → clarity_mode or default.  
   - Default mode = `"default"`.

3. **Build system prompt with mode and optional relationship/tone**  
   - Call a **new** helper (e.g. in lib/ai or in route) that:  
     - Builds base persona line (relationship + tone) from **client-supplied** preferences (e.g. `relationship_mode`, `tone_style` from body or from vella_settings if that’s safe metadata only — e.g. enum keys).  
     - Appends **mode directive** from the same text as `buildModeSystemPrompt` in agents.ts (e.g. “You are in stoic mentor mode: …”).  
     - Optionally appends 1–2 lines from **trait hints** if server has trait scores from behavioural_state or from a safe traits API (numeric only); use same logic as buildTraitHints (agents.ts) but without any user text.  
   - Do **not** call runConversationalGuide (it expects server-side memory profile and conversation); instead, build a single system string that includes: base persona (relationship/tone) + mode directive + optional trait hints + language instruction.

4. **Build user-side context**  
   - Concat: (optional) `memory_summary` + (optional) behavioural_state one-liner (e.g. “Connection depth: X; check-ins this week: Y”) + last N messages from `history`.  
   - Final user message = current `message`.  
   - So the prompt passed to the model = system (step 3) + context block (memory + state + history) + current message.

5. **Optional: intent-based tool calls**  
   - If intent is e.g. “needs clarity”, optionally call `runClarityEngine` (agents.ts) with the **current message only** (no server-stored history), then inject clarity result into the prompt or into a follow-up.  
   - Same for strategy/compass/emotion: only use **current request payload** (message + optional context string). No server-stored conversation.  
   - This can be a second phase; initially, only adding mode + relationship/tone to the prompt is enough.

6. **Call completion**  
   - Use `runFullAI` (lib/ai/fullAI.ts) or existing completion with the built system prompt and messages (context + history + current).  
   - Do **not** call `insertConversationMessage`; do not write to Supabase.

7. **Return**  
   - Return `{ reply, resultType, ... }` as today. No persistence of user or assistant content.

### Files to touch (for wiring only; no compliance changes in this list)

- `app/api/vella/text/route.ts`: add body parsing (history, memory_summary, preferred_mode, relationship_mode, tone_style); implement mode resolution; build system prompt with mode + relationship/tone; build context from client history + memory_summary + behavioural_state; remove retrieveTopK and insertConversationMessage; call runFullAI or equivalent.
- `lib/ai/agents.ts` or new `lib/ai/vellaTextOrchestration.ts`: export or duplicate mode directive map and (if used) buildTraitHints; function that takes (mode, relationshipKey, toneKey, traitScores, language) and returns system prompt string.
- `lib/security/validationSchemas.ts`: extend vellaTextRequestSchema with optional `history`, `memory_summary`, `preferred_mode`, `relationship_mode`, `tone_style` under strict limits (see D).

---

## D) SAFE PAYLOAD CONTRACT (client → server)

Allowed and disallowed fields for requests that must comply with “no server-stored free-text” and “server only uses client-supplied or safe state.”

### /api/vella/text (POST)

- **Allowed (in body):**  
  - `message`: string, required, max 4000 chars (current user message).  
  - `language`: string, optional, max 10 chars.  
  - `session_id`: UUID, optional (for idempotency/logging only).  
  - `history`: array of `{ role: "user" | "assistant", content: string }`, optional; each `content` max 4000 chars; array length max 20.  
  - `memory_summary`: string, optional, max 2000 chars (precomputed summary from client’s local memory; no raw journal or conversation content).  
  - `preferred_mode`: enum string, optional: `default` | `deep_reflection` | `execution_coach` | `stoic_mentor` | `clarity_mode` | `behaviour_analysis` | `mindset_reset`.  
  - `relationship_mode`: enum string, optional: `best_friend` | `mentor` | `big_sister` | `little_sister` | `partner_soft` | `partner_playful` | `other`.  
  - `tone_style`: enum string, optional: `soft` | `warm` | `direct` | `stoic` | `playful`.

- **Disallowed:**  
  - No raw journal entry content.  
  - No full conversation dump beyond the defined `history` array.  
  - No fields that would cause the server to store `message`, `history`, or `memory_summary` in Supabase.  
  - No other free-text fields except `message` and the defined `history[].content` and `memory_summary` (all client-held; server uses only in the request and does not persist).

### /api/check-ins (POST, PATCH)

- **Allowed:**  
  - `entry_date`, `mood`, `stress`, `energy`, `focus` (numbers or null).  
  - For PATCH: `id` plus any of the above.  
- **Disallowed:**  
  - `note` (or any text field). If a “note” is needed for UX, it stays on client only; server may accept at most `has_note: boolean` or `note_length: number` for aggregates.

### /api/journal (POST, PUT, PATCH)

- Under full compliance, server **does not** store journal content.  
- **Option 1 (remove API):** No journal write API; journal is local-only.  
- **Option 2 (safe metadata only):** If server must “record” that an entry existed: body may send only e.g. `local_entry_id`, `entry_date`, `word_count`, `content_hash` (SHA256). No `text`, `title`, or `content`.  
- **Disallowed:** `text`, `title`, `content`, or any field containing user free text.

### /api/reports/create (POST)

- **Allowed:** `type`, `severity` (enum or short code), optional `category`.  
- **Disallowed:** `summary`, `notes`, or any free-text field. If a hash is stored: `summary_hash` only (server never sees plain summary).

### General

- **Strict:** No request field may contain personal data or free text that the server then writes to Supabase, except where explicitly allowed above and even then only for in-request use (e.g. vella/text uses message and history in the prompt but must not persist them).  
- **Server responses:** May return generated text (e.g. reply) to the client; the client is responsible for storing it locally. Server does not persist that text in Supabase.

---

## Summary

- **A) Violations:** 12 code paths write free-text or personal data to Supabase (journal_entries, conversation_messages, check_ins.note, memory_chunks, user_reports.summary). behavioural_state is already safe.  
- **B) DB plan:** DELETE or MODIFY journal_entries, DELETE conversation_messages, MODIFY check_ins (drop note), DELETE memory_chunks and memory_embed_jobs, MODIFY user_reports (drop summary/notes or replace with hash/enum); KEEP behavioural_state_* and feedback; MODIFY profiles if display_name is ever stored.  
- **C) Wiring:** /api/vella/text should accept client-supplied history and memory_summary, resolve ConversationMode from intent + preferred_mode, build system prompt with mode + relationship/tone (and optional trait hints from safe state), and stop using server-side conversation or memory retrieval and stop writing to conversation_messages.  
- **D) Safe payload:** Strict schema for vella/text, check-ins, journal, and reports so that no free-text or personal data is sent in a way that would be stored in Supabase; vella/text may receive message and history for the single request only and must not persist them.

No code has been modified; this document is the plan only.
