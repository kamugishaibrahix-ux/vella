# Durable Behavioural Intelligence Core — Backend Architecture

**Scope:** Backend architecture design only. No code changes, no UI, no feature ideas. Target scale: 100k+ users.

**Context:** Journal, check-ins, conversation are client-local; Supabase holds billing, tokens, profiles; no embeddings, no durable conversation memory, no snapshot versioning; deterministic engines and LLM endpoints exist.

---

## 1. Full Backend Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT (out of scope)                                  │
│  Journal CRUD · Check-in CRUD · Conversation send/receive · Goals CRUD · Event emission  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                              HTTPS (auth, rate limit, validation)
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER (Next.js App Router)                               │
│  /journal · /checkins · /vella/text · /reflection · /insights/* · /goals · /progress …   │
│  Token check · Tier gate · Kill switch · Request validation                              │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
┌───────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
│   RAW DATA LAYER           │ │   DERIVED SIGNAL LAYER     │ │   SNAPSHOT LAYER          │
│   (Supabase PG)            │ │   (Supabase PG + Redis)    │ │   (Supabase PG)            │
│   journal_entries          │ │   user_traits              │ │   behavioural_snapshots   │
│   check_ins                │ │   user_themes              │ │   snapshot_deltas         │
│   conversation_messages    │ │   user_loops               │ │   snapshot_triggers       │
│   goals / goal_actions     │ │   user_distortions         │ │   (versioned, typed)      │
│   behavioural_events       │ │   progress_metrics         │ │                           │
│   PK: user_id + id/time    │ │   connection_depth         │ │   PK: user_id + snapshot_ │
│   Index: user_id, time     │ │   regulation_scores         │ │   id, type, created_at   │
│   Retention: configurable  │ │   PK: user_id + window     │ │   Retention: keep N per    │
│   Triggers: on insert      │ │   Index: user_id, updated  │ │   type; archive old        │
│   → queue signal recalc    │ │   Retention: overwrite/    │ │   Triggers: on signal     │
└───────────────────────────┘ │   append by window         │ │   commit; on schedule      │
                    │         └───────────────────────────┘ └───────────────────────────┘   │
                    │                     │                             │                 │
                    │                     │  async job / queue          │                 │
                    ▼                     ▼                             ▼                 │
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         BEHAVIOURAL STATE ENGINE (worker / serverless)                     │
│  Input: raw data (journal, check_ins, messages, goals, events)                            │
│  Output: derived signals → snapshot (daily/weekly/triggered)                              │
│  Concurrency: per-user serialization (user_id partition); idempotent by window/source      │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                    │
                    │  write chunks / summaries for retrieval
                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         MEMORY RETRIEVAL LAYER                                             │
│   (Supabase PG: embeddings + chunks; optional vector index / pgvector)                     │
│   memory_chunks (user_id, source_type, source_id, content, embedding, created_at)           │
│   Chunking: by entry (journal), by turn (conversation), by snapshot summary                │
│   Retrieval: similarity + recency + privacy filter; top-K by user                          │
│   Retention: align with raw retention; anonymize/delete on account delete                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                    │
                    │  read: recent messages + summary + retrieved chunks + snapshot summary
                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         LLM INTEGRATION PIPELINE                                           │
│   1. Deterministic: assemble window (messages, last snapshot, traits, regulation)           │
│   2. Memory: fetch chunks (embedding search) + apply privacy                               │
│   3. Persona: inject from vella_settings + profile                                         │
│   4. Context assembly → single prompt + optional tools                                     │
│   5. Token charge (after success); fallback: lite/scripted if over quota or circuit open   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                                                   │
│   OpenAI (chat, embeddings, TTS, STT, realtime) · Stripe (existing) · Supabase Auth       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Data flow (summary):**

- **Write path:** Client → API → Raw Data Layer (insert). Trigger or queue → Behavioural State Engine → Derived Signal Layer → Snapshot Layer. Optional: Engine or post-insert job → Memory Retrieval (chunk + embed).
- **Read path (LLM):** API → Raw (recent messages) + Derived (traits, etc.) + Snapshot (latest) + Memory (retrieved chunks) → Context assembly → LLM → Response.
- **No server file storage:** All durable state in Supabase (and Redis for hot caches / rate state if needed). No `.vella/` files.
- **No localStorage for persistence:** Client sends payloads; server is source of truth for journal, check-ins, conversation, goals.

---

## 2. Core Data Layers (Detail)

### 2.1 Raw Data Layer

**Storage:** Supabase (PostgreSQL). No Redis for raw data (durability and consistency).

**Tables:**

| Table | Purpose |
|-------|--------|
| journal_entries | One row per journal entry. |
| check_ins | One row per check-in (mood, stress, energy, focus, note, entry_date). |
| conversation_messages | One row per user or assistant message (session/turn ordering). |
| goals | One row per goal (type, title, description, status, priority, target_date). |
| goal_actions | Optional; sub-actions for goals. |
| behavioural_events | Time-series events (e.g. “reflection_completed”, “insight_viewed”) for triggers. |

**Schema (logical):**

- **journal_entries**  
  - id (uuid, PK), user_id (uuid, FK auth.users), title (text nullable), content (text), created_at (timestamptz), updated_at (timestamptz).  
  - Optional: enrichment payload (jsonb) for server-side tags/themes/loops/distortions if computed server-side.  
  - Primary key: id.  
  - Indexes: (user_id, created_at DESC), (user_id) for list/export.

- **check_ins**  
  - id (uuid, PK), user_id (uuid), entry_date (date), mood, stress, energy, focus (smallint nullable), note (text nullable), created_at (timestamptz).  
  - Primary key: id.  
  - Indexes: (user_id, entry_date DESC), (user_id, created_at).

- **conversation_messages**  
  - id (uuid, PK), user_id (uuid), role (user | assistant), content (text), session_id (uuid nullable), created_at (timestamptz).  
  - Primary key: id.  
  - Indexes: (user_id, created_at DESC), (user_id, session_id, created_at) for “recent in session”.

- **goals**  
  - id (uuid, PK), user_id (uuid), type (life | focus | weekly), title (text), description (text nullable), status (text), priority (int), target_date (date nullable), created_at, updated_at.  
  - Primary key: id.  
  - Indexes: (user_id, type), (user_id, updated_at DESC).

- **goal_actions**  
  - id (uuid, PK), goal_id (uuid FK goals), user_id (uuid), label (text), status (text), due_date (date nullable), completed_at (timestamptz nullable), created_at, updated_at.  
  - Primary key: id.  
  - Index: (user_id, goal_id).

- **behavioural_events**  
  - id (uuid, PK), user_id (uuid), event_type (text), payload (jsonb nullable), created_at (timestamptz).  
  - Primary key: id.  
  - Indexes: (user_id, created_at DESC), (user_id, event_type, created_at) for trigger queries.

**Retention rules:**

- journal_entries, check_ins, conversation_messages: retain per org policy (e.g. 2 years); then archive or delete. Partition by user_id + time for efficient purge.
- goals / goal_actions: retain until user delete or explicit purge.
- behavioural_events: retain for trigger window (e.g. 90 days); then delete.

**Write triggers:**

- On insert journal_entries: enqueue “signal_recalc” job for user_id with source=journal, source_id=id (async).
- On insert check_ins: enqueue “signal_recalc” for user_id with source=check_in.
- On insert conversation_messages (batch or single): enqueue “signal_recalc” for user_id with source=conversation; optionally enqueue “memory_chunk” job for embedding.
- On insert/update goals: enqueue “signal_recalc” for user_id with source=goals.
- On insert behavioural_events: evaluate snapshot_trigger rules; if match, enqueue “snapshot” job for user_id with type=triggered.

---

### 2.2 Derived Signal Layer

**Storage:** Supabase (PostgreSQL) for durable signals; Redis (optional) for hot cache of “latest” per user to reduce DB read load at 100k+ users.

**Tables:**

| Table | Purpose |
|-------|--------|
| user_traits | Latest trait scores per user (resilience, clarity, discipline, etc.) + window metadata. |
| user_traits_history | Time-windowed history for charts (window_start, window_end, scores). |
| user_themes | Life themes derived from journal/check-ins. |
| user_loops | Behaviour loops (trigger, thought, behaviour, consequence). |
| user_distortions | Cognitive distortions with frequency/severity. |
| progress_metrics | Consistency, emotional openness, improvement, stability, connection_index. |
| connection_depth | Depth score, last_reciprocated, last_increase. |
| regulation_scores | Per-strategy or aggregate regulation state (optional). |

**Schema (logical):**

- **user_traits**  
  - user_id (PK), resilience, clarity, discipline, emotional_stability, motivation, self_compassion (numeric), last_computed_at (timestamptz), updated_at.  
  - Primary key: user_id.  
  - Index: user_id (single row per user).

- **user_traits_history**  
  - id (uuid, PK), user_id (uuid), window_start (timestamptz), window_end (timestamptz), same score columns, created_at.  
  - Primary key: id.  
  - Indexes: (user_id, window_end DESC).

- **user_themes**  
  - id (uuid, PK), user_id (uuid), theme (text), weight or count (optional), updated_at.  
  - Index: (user_id).

- **user_loops**  
  - id (uuid, PK), user_id (uuid), trigger, thought, behaviour, consequence (text), severity (optional), updated_at.  
  - Index: (user_id).

- **user_distortions**  
  - id (uuid, PK), user_id (uuid), type (text), frequency, severity (optional), examples (jsonb), updated_at.  
  - Index: (user_id).

- **progress_metrics**  
  - user_id (PK), consistency_score, emotional_openness, improvement_score, stability_score, connection_index, data (jsonb nullable), updated_at.  
  - Primary key: user_id.

- **connection_depth**  
  - user_id (PK), depth_score (numeric), last_reciprocated (timestamptz), last_increase (timestamptz), updated_at.  
  - Primary key: user_id.

**Retention:**

- user_traits: overwrite; single row per user.
- user_traits_history: append by window; retain last N windows (e.g. 52 weekly).
- user_themes, user_loops, user_distortions: overwrite or upsert from latest run; optional history table if needed.
- progress_metrics, connection_depth: overwrite.

**Write triggers:**

- No DB trigger from client. Writes come only from **Behavioural State Engine** after computation. Engine is triggered by queue (from raw data layer triggers) or cron (daily rollup).

---

### 2.3 Snapshot Layer

**Storage:** Supabase (PostgreSQL).

**Tables:**

| Table | Purpose |
|-------|--------|
| behavioural_snapshots | Versioned snapshot of behavioural state (signals + optional summary). |
| snapshot_deltas | Delta or diff metadata between consecutive snapshots (optional). |
| snapshot_triggers | Rule definitions for when to create triggered snapshots (optional). |

**Schema (logical):**

- **behavioural_snapshots**  
  - id (uuid, PK), user_id (uuid), snapshot_type (daily | weekly | triggered), created_at (timestamptz), window_start (timestamptz), window_end (timestamptz), payload (jsonb).  
  - payload: traits, themes, loops, distortions, progress, connection_depth, optional text summary.  
  - Primary key: id.  
  - Indexes: (user_id, snapshot_type, created_at DESC), (user_id, created_at DESC).

- **snapshot_deltas**  
  - id (uuid, PK), user_id (uuid), from_snapshot_id (uuid), to_snapshot_id (uuid), created_at, diff_summary (jsonb or text).  
  - Primary key: id.  
  - Index: (user_id, created_at DESC).

- **snapshot_triggers**  
  - id (uuid, PK), user_id (uuid) or global, event_type (text), condition (jsonb), created_at.  
  - Used by engine to decide “create triggered snapshot” after behavioural_events.

**Retention:**

- behavioural_snapshots: keep last N per (user_id, snapshot_type), e.g. 7 daily, 12 weekly, 50 triggered; archive or delete older.
- snapshot_deltas: keep for last M snapshots per user.
- snapshot_triggers: retain until user delete or rule remove.

**Write triggers:**

- From Behavioural State Engine only: after committing derived signals, engine writes snapshot row(s). Daily/weekly via cron; triggered via event-driven job.

---

### 2.4 Memory Retrieval Layer

**Storage:** Supabase (PostgreSQL). Use pgvector (or equivalent) for embedding column if available; otherwise store embedding in jsonb and use application-side similarity until DB supports vector index.

**Tables:**

| Table | Purpose |
|-------|--------|
| memory_chunks | Chunked content + embedding for RAG / memory retrieval. |

**Schema (logical):**

- **memory_chunks**  
  - id (uuid, PK), user_id (uuid), source_type (journal | conversation | snapshot_summary), source_id (uuid), content (text), embedding (vector(1536) or jsonb), created_at (timestamptz), metadata (jsonb nullable).  
  - content: normalized text (e.g. one journal entry body, or one conversation turn, or one snapshot summary).  
  - Primary key: id.  
  - Indexes: (user_id, source_type, created_at DESC); vector index on (user_id, embedding) if pgvector.

**Chunking strategy:**

- Journal: one chunk per journal entry (id = source_id); content = title + content (truncated to max length, e.g. 2k chars).
- Conversation: one chunk per assistant message or per user+assistant pair; content = concatenated turn(s).
- Snapshot: one chunk per snapshot summary (e.g. weekly); content = text summary from payload or generated summary.

**Retrieval policy:**

- Query: user_id + query_embedding + limit K + optional source_type filter.
- Return chunks ordered by similarity (cosine or inner product) then recency.
- Apply privacy: only chunks for that user_id; respect privacy_flags (e.g. exclude_from_training does not change retrieval, but export/delete must purge or anonymize).

**Retention:**

- Align with raw source: when a journal entry or conversation is deleted, delete or soft-delete corresponding chunks. When snapshot is purged, purge its chunk.
- On account delete: delete all memory_chunks for user_id.

**Write triggers:**

- After insert journal_entries: enqueue “embed_chunk” job (user_id, source_type=journal, source_id).
- After insert conversation_messages (e.g. every N messages or on session end): enqueue “embed_chunk” for conversation.
- After insert behavioural_snapshots (e.g. weekly): enqueue “embed_chunk” for snapshot_summary.
- Embedding job: call embedding API, insert into memory_chunks.

---

## 3. Behavioural State Engine

**Definition:** A component that reads from the Raw Data Layer, runs deterministic (and optionally LLM) logic to compute derived signals and snapshots, and writes to the Derived Signal Layer and Snapshot Layer. It is triggered by events (from raw writes) or by schedule.

### 3.1 What recalculates automatically?

- **Traits:** From check-ins, journal count, loops, distortions, patterns (existing formula). Recompute when: new check-in, new journal entry, or periodic (e.g. daily).
- **Themes:** From journal + check-ins (existing extractLifeThemes). Recompute when: new journal entry or daily.
- **Loops:** From journal + check-ins (existing detectBehaviourLoops). Recompute when: new journal entry or daily.
- **Distortions:** From journal + conversation (existing detectCognitiveDistortions). Recompute when: new journal or new conversation messages or daily.
- **Progress metrics:** From check-ins + journal (consistency, emotional openness, improvement, stability, connection_index). Recompute when: new check-in or journal or daily.
- **Connection depth:** From progress + journaling depth + message count. Recompute when: progress updated or after reflection/conversation.
- **Regulation scores:** From traits, themes, loops, distortions (existing generateRegulationStrategies). Recompute when: traits/themes/loops/distortions updated.
- **Snapshots (daily/weekly):** At fixed times (e.g. 00:05 UTC daily, Sunday 00:10 UTC weekly), for all active users or for users with activity in the window.

### 3.2 Trigger map: what is triggered by journal?

- On insert **journal_entries**:  
  - Enqueue **signal_recalc** (user_id, source=journal, source_id).  
  - Enqueue **embed_chunk** (user_id, journal, source_id).  
- Signal_recalc job: recompute traits, themes, loops, distortions, progress, connection_depth, regulation (in dependency order). Write to Derived Signal Layer. Then optionally create **triggered** snapshot if rules in snapshot_triggers match.

### 3.3 Trigger map: what is triggered by check-in?

- On insert **check_ins**:  
  - Enqueue **signal_recalc** (user_id, source=check_in).  
- Signal_recalc: recompute traits, progress, connection_depth (and any signal that depends on check-ins). Write to Derived Signal Layer.

### 3.4 Trigger map: what is triggered by conversation?

- On insert **conversation_messages**:  
  - Enqueue **signal_recalc** (user_id, source=conversation) — for connection_depth and any conversation-dependent signals.  
  - Enqueue **embed_chunk** (user_id, conversation, session_id or batch of message ids) — possibly batched every N messages.  
- Optionally: after assistant message, enqueue **update connection_depth** (lightweight).

### 3.5 Trigger map: goals and events

- On insert/update **goals** or **goal_actions**: enqueue **signal_recalc** (user_id, source=goals).  
- On insert **behavioural_events**: evaluate snapshot_triggers; if condition matches, enqueue **snapshot** (user_id, type=triggered).

### 3.6 Async vs sync

- **Sync (in request path):** Raw data writes only (insert journal_entries, check_ins, conversation_messages, goals). Return 201/200. Do **not** run engine in request.  
- **Async:** All signal recalc, snapshot creation, embed_chunk run in background jobs (queue + worker or serverless). This keeps latency low and avoids timeouts at 100k+ users.

### 3.7 Race conditions

- **Per-user serialization:** Process one signal_recalc job per user at a time (e.g. queue per user_id, or distributed lock keyed by user_id). New events for the same user enqueue a new job; the job always reads latest raw data and overwrites derived tables, so one “latest” state wins.  
- **Idempotency:** Jobs are idempotent by (user_id, window or source_id). Re-running with same inputs produces same outputs; duplicate queue messages do not corrupt state.  
- **Snapshot versioning:** Snapshots are append-only with created_at. No update of existing snapshot; “latest” = max(created_at) per (user_id, type).  
- **Embedding jobs:** Dedupe by (user_id, source_type, source_id). If same source_id is enqueued twice, second run can no-op or overwrite chunk.

### 3.8 Update graph (dependency order)

```
Raw: journal, check_ins, conversation_messages, goals, behavioural_events
         │
         ▼
  [signal_recalc job]
         │
    ┌────┴────┐
    ▼         ▼
  traits    themes, loops, distortions  (can run in parallel per user)
    │         │
    └────┬────┘
         ▼
  progress_metrics, connection_depth
         │
         ▼
  regulation_scores (if separate table)
         │
         ▼
  behavioural_snapshots (daily/weekly/triggered)
```

Same job can run all steps in order; or split into sub-jobs (e.g. “traits”, “themes_loops_distortions”, “progress_connection”, “snapshot”) with explicit ordering in queue (e.g. stages).

---

## 4. LLM Integration Model

### 4.1 Separation of concerns

- **Deterministic computation:** Assemble context: recent messages (from conversation_messages), last snapshot summary (from behavioural_snapshots), current traits/themes/loops/distortions (from Derived Signal Layer), regulation strategies (static or from DB). No LLM call in this step.  
- **LLM interpretation:** Single (or few) completion calls with the assembled context; no multi-step agent loop in v1.  
- **Memory retrieval:** Query memory_chunks by user_id + query embedding; get top-K chunks; filter by privacy; append to context.  
- **Persona injection:** Read vella_settings + profiles for tone, voice_model, relationship_mode, language; inject into system prompt.  
- **Token charging:** After successful completion, call existing token enforcement (record usage to token_usage / subscriptions). Deny request if over quota before calling LLM.

### 4.2 Context assembly pipeline

1. **Auth + quota:** Resolve user_id; checkTokenAvailability; if not allowed, return 402 or fallback.  
2. **Deterministic fetch:** In one or few DB round-trips:  
   - Recent conversation_messages (e.g. last 20) for user_id.  
   - Latest behavioural_snapshot (one row, type=weekly or daily) for user_id.  
   - Current user_traits, user_themes, user_loops, user_distortions (or from snapshot payload).  
   - Persona: vella_settings, profiles for user_id.  
3. **Memory retrieval (optional):** If query or reflection type needs long-term memory:  
   - Generate query_embedding from current user message or reflection type.  
   - Select from memory_chunks where user_id = X order by similarity limit K.  
   - Append chunk contents to context (with source labels).  
4. **Build prompt:** System: persona + behavioural summary (from snapshot or signals) + retrieval chunks. User: recent messages + current turn.  
5. **LLM call:** Single completion (or tool use if needed later).  
6. **Post:** Persist assistant message to conversation_messages; charge tokens; optionally enqueue signal_recalc and embed_chunk.

### 4.3 Memory window size

- **Conversation window:** Last N messages (e.g. N=20 or 30); configurable per product; token budget caps total.  
- **Snapshot in context:** One latest snapshot summary (e.g. 500–1000 chars).  
- **Retrieved chunks:** Top K (e.g. K=5–10) chunks; each chunk truncated to max chars (e.g. 300).  
- **Total context budget:** Fit within model context (e.g. 128k); reserve space for system + user + response.

### 4.4 Snapshot injection logic

- For reflection / vella/text / architect / etc.: Prefer “latest” snapshot by (user_id, snapshot_type). Priority: weekly > daily > triggered. Include in system block as “Behavioural summary: …”.  
- If no snapshot exists: Fall back to current derived signals (traits, themes, loops, distortions) as text block.  
- Snapshot is read-only in the request path; updates happen only in engine.

### 4.5 Fallback logic

- If token quota exceeded: Return 402 or structured “quota_exceeded”; do not call LLM.  
- If OpenAI circuit open (e.g. too many failures): Return 503 or “lite” response (scripted or deterministic).  
- If memory retrieval fails or times out: Proceed without retrieved chunks (smaller context).  
- If snapshot/signals fetch fails: Proceed with empty or cached previous state; log for debugging.

---

## 5. Scalability Model

### 5.1 No server file storage

- All durable state lives in Supabase (or, if introduced, Redis for ephemeral/cache).  
- Remove any write path to `.vella/` or local disk for user state.  
- Workers/serverless are stateless; they read/write only DB and queue.

### 5.2 Remove localStorage reliance

- Client sends journal entry, check-in, message, goal in request body; API writes to Supabase raw tables.  
- Client may cache for offline/UX but server is source of truth.  
- Reads (list journal, list check-ins, recent messages, goals) come from API → Supabase.  
- Migration path: one-time or phased upload of existing localStorage data to server (see Migration below).

### 5.3 Horizontal scaling

- **API:** Next.js app can run on multiple instances behind a load balancer; no in-memory state.  
- **Workers:** Multiple workers consuming from a single queue (e.g. Supabase pg_notify, Redis Queue, or managed queue). Per-user serialization is achieved by partition key user_id (e.g. hash(user_id) % workers or queue per user_id bucket).  
- **Supabase:** Use connection pooling (PgBouncer or Supabase pooler); index all query patterns; partition large tables (e.g. conversation_messages, behavioural_events) by user_id or time.  
- **Redis (if used):** For rate limit counters, token cache, or “latest snapshot” cache; cluster or single node with high memory; no Redis for durable data.

### 5.4 Rate limiting strategy

- Keep per-route, per-user limits (e.g. journal write 30/60s, reflection 5/120s).  
- Store counters in Redis keyed by (user_id, route) with TTL = window; or in DB with short TTL table.  
- At 100k users, Redis is preferable for rate limits to avoid DB load.  
- Global rate limit per IP for unauthenticated or abusive patterns.

### 5.5 Token enforcement strategy

- Remain in Supabase: subscriptions.monthly_token_allocation_used, token_balance, token_usage rows.  
- Check before each LLM call; charge after success.  
- Use DB transaction or conditional update to avoid over-spend (optimistic lock or “remaining = remaining - N where remaining >= N”).  
- Optional: cache “remaining” per user in Redis with short TTL (e.g. 60s) and refresh from DB on cache miss or after charge.

### 5.6 Caching strategy

- **Read-through cache for “latest” per user:** e.g. latest snapshot, current traits. Key: user_id, TTL 60–300s. Invalidate on write to that user’s derived/snapshot data.  
- **Persona (vella_settings, profile):** Cache per user_id; TTL or invalidate on profile/settings update.  
- **Static data (e.g. regulation strategies list):** Cache at edge or in-memory; long TTL.  
- **Memory retrieval:** No cache of embedding results (query varies); optional cache of “recent chunks” per user if query pattern is stable.

---

## 6. Migration Strategy

### 6.1 Local journal → server DB

- **Option A (big bang):** New API: POST /api/journal with body { entries: [...] }. Client sends full journal array once (or batched). Server inserts into journal_entries with user_id. Idempotency by client-provided id or (user_id, created_at).  
- **Option B (incremental):** Client continues to write locally; background job or periodic call: client sends “since” timestamp or last sync id; server returns server-side entries after that; client sends new local entries; server merges (by id or created_at) and inserts. Conflict: server wins or last-write-wins with timestamp.  
- **Schema:** journal_entries table must accept client fields (id, title, content, created_at, updated_at). Server adds user_id, and optionally id overwrite to client id if UUID.

### 6.2 Local conversation → server DB

- Same pattern: one-time or batched POST with messages array; server inserts into conversation_messages. Order by created_at or sequence.  
- Idempotency: client message id or (user_id, created_at) to avoid duplicates on retry.

### 6.3 Existing users

- **Feature flag or version:** “Use server journal” vs “Use local journal”. New users get server only. Existing users can be migrated by:  
  - In-app “Sync journal to cloud” action: upload local entries to server.  
  - Or background migration job: when user next opens app, client sends all local journal/check-ins/conversation; server upserts.  
- **Dual-write period:** Client writes to both localStorage and API; API writes to Supabase. After verification period, switch reads to API only and stop writing to localStorage.  
- **Goals:** Same as today’s serverLocal; migrate to Supabase goals table. One-time script or API: POST /api/goals/import with array; server inserts goals and goal_actions.

### 6.4 Zero downtime

- **Backend:** Add new tables (journal_entries, check_ins, conversation_messages, goals, etc.) and new API routes or versions (e.g. /api/v2/journal). Old routes keep working (read from local if client sends data in body, or return empty).  
- **Deploy:** Deploy API that can read/write both old path (local in body) and new path (DB).  
- **Switch:** Flip feature flag or client version to “prefer server”. Server becomes source of truth; old route for “list journal” reads from DB when flag is on.  
- **Queue/workers:** Deploy workers after tables and triggers exist; enable triggers after workers are ready to consume.  
- **No downtime:** No single “cutover” that drops writes; dual-write and gradual read switch.

---

## 7. Update Trigger Map (Summary)

| Event | Queue / action | Consumer |
|-------|----------------|----------|
| INSERT journal_entries | signal_recalc(user_id, journal, source_id), embed_chunk(user_id, journal, source_id) | Behavioural State Engine, Embedding worker |
| INSERT check_ins | signal_recalc(user_id, check_in) | Behavioural State Engine |
| INSERT conversation_messages | signal_recalc(user_id, conversation), embed_chunk(user_id, conversation, …) | Behavioural State Engine, Embedding worker |
| INSERT/UPDATE goals | signal_recalc(user_id, goals) | Behavioural State Engine |
| INSERT behavioural_events | Evaluate snapshot_triggers → snapshot(user_id, triggered) | Behavioural State Engine |
| Cron daily | snapshot(user_id, daily) for active users | Behavioural State Engine |
| Cron weekly | snapshot(user_id, weekly) for active users | Behavioural State Engine |
| After signal_recalc commits | Optional: snapshot(user_id, triggered) if rules match | Behavioural State Engine |

---

## 8. LLM Pipeline Map (Summary)

```
Request (e.g. /reflection, /vella/text)
    │
    ├─ Auth (requireUserId)
    ├─ Rate limit (per user)
    ├─ Token check (checkTokenAvailability) ──► 402 or fallback if over
    │
    ├─ Fetch: conversation_messages (recent N)
    ├─ Fetch: behavioural_snapshots (latest) or user_traits, user_themes, …
    ├─ Fetch: vella_settings, profiles (persona)
    ├─ Optional: memory_chunks retrieval (query_embedding, top-K)
    │
    ├─ Build system prompt: persona + snapshot/signals + retrieved chunks
    ├─ Build user prompt: recent messages + current turn
    │
    ├─ LLM call (runFullAI / completion) ──► circuit open? 503 or lite
    │
    ├─ Persist assistant message → conversation_messages
    ├─ Charge tokens (chargeTokensForOperation)
    └─ Enqueue: signal_recalc(conversation), embed_chunk(conversation)
```

---

## 9. Migration Plan (Phased)

| Phase | Actions | Rollback |
|-------|--------|----------|
| 1 | Create Supabase tables (raw, derived, snapshot, memory_chunks). No triggers yet. Deploy API that can write to raw tables (e.g. POST /api/v2/journal, /api/v2/check-ins, /api/v2/conversation). Client unchanged. | Drop new routes; keep tables. |
| 2 | Deploy queue + Behavioural State Engine workers. Add DB triggers (or app-level enqueue) on insert raw. Enable signal_recalc and snapshot jobs. Backfill: optional one-time job to backfill derived/snapshot from existing raw data if any. | Disable triggers; stop workers. |
| 3 | Add memory_chunks table and embedding worker. Add triggers or enqueue for embed_chunk. Backfill embeddings for existing journal/conversation (batch). | Stop embed jobs; leave chunks. |
| 4 | Client: add “Sync to cloud” or dual-write. New users write to API only. Existing users can upload once or dual-write. | Client revert to local-only. |
| 5 | Switch read path: list journal, check-ins, conversation from API → DB when flag “use_server” is true. Deprecate “send full body” for read. | Flip flag back. |
| 6 | Remove server file storage (e.g. .vella/): move goals, progress, connection_depth to Supabase; update engine and API to read/write DB. | Restore serverLocal reads. |
| 7 | Remove localStorage as source of truth; server only. Optional: delete local data after confirmed sync. | N/A (data now in server). |

---

## 10. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Data loss during migration** | High | Dual-write; do not delete local until server data verified. Export/backup before cutover. |
| **Queue backlog at scale** | Medium | Per-user serialization + enough workers; monitor queue depth; scale workers. Priority queue for “recent” users. |
| **Embedding cost and latency** | Medium | Batch embed jobs; limit chunks per user; use small/fast embedding model; optional: skip embedding for free tier. |
| **Supabase connection limits** | High at 100k | Use pooler; limit connections per worker; consider read replicas for heavy read routes. |
| **Race: two recalc jobs same user** | Low | Serialize by user_id (queue partition or lock); idempotent jobs. |
| **Snapshot table growth** | Medium | Retention policy (keep N per type); partition by user_id + time; archive old to cold storage. |
| **Token enforcement consistency** | Medium | Charge in same transaction as usage record; use DB constraint or conditional update. |
| **LLM context too large** | Low | Cap message count, snapshot size, and chunk count; truncate; monitor token usage. |
| **Privacy: embeddings contain PII** | High | Access control (RLS); encrypt at rest; retention and delete on account delete; do not use for training unless consented. |
| **Zero-downtime rollback** | Medium | Feature flags for “read from server” and “write to server”; keep old code paths until stable. |

---

*End of architecture document. No code, no UI, no feature ideas.*
