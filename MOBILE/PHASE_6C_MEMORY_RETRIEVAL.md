# Phase 6C — Memory Retrieval Layer (Chunks + Embeddings + Top-K)

Backend-only. No UI changes. Memory chunks stored in Supabase; embeddings via OpenAI; top-K retrieval wired into vella/text and reflection.

---

## Migration

**File:** `MOBILE/supabase/migrations/20260220_memory_chunks.sql`

### memory_chunks

- `id` uuid PK, `user_id` uuid FK auth.users ON DELETE CASCADE
- `source_type` text CHECK (journal | conversation | snapshot)
- `source_id` uuid, `chunk_index` int, `content` text, `content_hash` text
- `token_estimate` int, `embedding` jsonb, `embedding_model` text, `embedded_at` timestamptz
- `created_at`, `updated_at` timestamptz
- Unique: `(user_id, source_type, source_id, chunk_index, content_hash)`
- Indexes: (user_id, source_type, created_at desc), (user_id, embedded_at) where embedded_at not null, (user_id, source_type, source_id)

### memory_embed_jobs

- `id` uuid PK, `user_id` uuid FK, `chunk_id` uuid FK memory_chunks ON DELETE CASCADE
- `status` pending | processing | done | error, `error` text, `attempts` int
- Indexes: (status, created_at), (user_id, status)

RLS: SELECT/INSERT/UPDATE/DELETE where auth.uid() = user_id on both tables.

---

## Routes

| Method | Route | Auth | Description |
|--------|--------|------|-------------|
| POST | /api/memory/chunk | Service key | Create chunk rows for a source (journal | conversation | snapshot) |
| POST | /api/memory/embed | Service key | Embed pending chunks (batch 16, OpenAI text-embedding-3-small) |
| POST | /api/memory/reindex | Service key | Backfill chunks for user, last N days (cap 30) |
| GET | /api/memory/search | requireUserId | Debug retrieval; ?q= & k=5; free plan: excerpt redacted |

Service key: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`, plus enforceServiceKeyProtection (rate limit, optional IP allowlist).

---

## State and privacy

- Chunks and jobs are per-user; RLS enforces auth.uid() = user_id.
- User delete cascades: memory_chunks and memory_embed_jobs FK ON DELETE CASCADE.
- No .vella/ writes; no localStorage reads for memory backend.
- Embeddings only for paid (pro/elite); free uses recency-only retrieval. isAIDisabled() disables embedding calls; retrieval falls back to recency.

---

## Idempotency

- Chunk upsert: unique (user_id, source_type, source_id, chunk_index, content_hash); duplicates ignored.

---

## Gating

- **Kill switch:** isAIDisabled() → embedText throws AIDisabledError; retrieve falls back to recency-only.
- **Plan:** getUserPlanTier; pro/elite get embedding-based retrieval and excerpts in search/prompt; free gets recency-only and no excerpts in GET /api/memory/search.

---

## Manual verification steps

1. **Apply migrations**  
   Run Supabase migration `20260220_memory_chunks.sql` so `memory_chunks` and `memory_embed_jobs` exist.

2. **Create journal + vella message**  
   Create a journal entry via POST /api/journal. Send a message via POST /api/vella/text.

3. **Reindex (service key)**  
   `POST /api/memory/reindex` with body `{ "userId": "<your-user-uuid>", "days": 7 }` and `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. Expect `{ ok: true, journal: n, conversation: n, snapshot: n }`.

4. **Embed (service key)**  
   `POST /api/memory/embed` with body `{ "limit": 50 }` and service key. Expect `{ embedded: n, skipped: m, errors: e }`.

5. **Search (authed)**  
   `GET /api/memory/search?q=hello&k=5` with user session. Expect `{ results: [{ sourceType, sourceId, excerpt (or "" for free), score, createdAtISO }] }`.

6. **Vella/text with memory**  
   Send another POST /api/vella/text; confirm server runs retrieval (logs or behaviour). Response unchanged; memory is injected into context only.

7. **Cascade on user delete**  
   Delete the user (e.g. account/delete or DB); confirm memory_chunks (and memory_embed_jobs) rows for that user are removed (FK cascade).

---

## Build

- `pnpm run build` in MOBILE must pass (exit 0).
