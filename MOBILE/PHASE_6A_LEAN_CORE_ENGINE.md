# Phase 6A — Lean Core Intelligence Engine

Deterministic-only behavioural state: two Supabase tables, one engine, no OpenAI. No journal/check-ins/conversation in DB until Phase 6B.

---

## Tables + RLS

### behavioural_state_current

- `user_id` uuid PK, FK auth.users(id) ON DELETE CASCADE
- `version` int NOT NULL DEFAULT 1
- `state_json` jsonb NOT NULL DEFAULT '{}'
- `last_computed_at` timestamptz NOT NULL DEFAULT now()
- `updated_at` timestamptz NOT NULL DEFAULT now()

**RLS:** SELECT, INSERT, UPDATE, DELETE allowed where `auth.uid() = user_id`.

### behavioural_state_history

- `id` uuid PK DEFAULT gen_random_uuid()
- `user_id` uuid NOT NULL, FK auth.users(id) ON DELETE CASCADE
- `version` int NOT NULL
- `snapshot_type` text NOT NULL CHECK (snapshot_type IN ('daily','weekly','triggered'))
- `state_json` jsonb NOT NULL
- `created_at` timestamptz NOT NULL DEFAULT now()

**Indexes:** `(user_id, created_at DESC)`, `(user_id, snapshot_type, created_at DESC)`.

**RLS:** SELECT, INSERT, DELETE where `auth.uid() = user_id`.

---

## Routes

| Method | Route | Auth | Rate limit | Description |
|--------|--------|------|------------|-------------|
| GET | /api/state/current | requireUserId | 60/60s | Current state; version 0 + empty state if no row |
| POST | /api/state/recompute | requireUserId | 5/60s | Body: snapshotType?, window?; runs recomputeState |
| GET | /api/state/history | requireUserId | 60/60s | Query: type?, limit? (default 10, max 50); snapshot list |

**Deprecated:** GET /api/behavioural-state — use GET /api/state/current.

---

## State schema (state_json)

Always present; empty defaults until Phase 6B.

```ts
{
  traits: {},
  themes: [],
  loops: [],
  distortions: [],
  progress: {},
  connection_depth: 0,
  regulation: {},
  metadata: { window_start: string; window_end: string; sources: string[] }
}
```

---

## Inputs used in Phase 6A (durable only)

- **profiles** — existence check for user (sources include "profiles")
- **vella_settings** — existence check (sources include "vella_settings")
- **subscriptions** — plan metadata (sources include "subscriptions")

No journal, check-ins, conversation, or token_usage content used in state computation. Engine is deterministic and idempotent: same durable inputs → same state_json.

---

## Empty by design until Phase 6B

- **traits** — computed from check-ins/journals/patterns (not in DB yet)
- **themes** — from journal/check-ins (not in DB yet)
- **loops** — from journal (not in DB yet)
- **distortions** — from journal/conversation (not in DB yet)
- **progress** — from check-ins/journals (not in DB yet)
- **connection_depth** — from progress + journals + messages (not in DB yet)
- **regulation** — from traits/themes/loops (derived)

Phase 6B will add raw tables (journal_entries, check_ins, conversation_messages); engine can then be extended to compute from them.

---

## Wired routes (read from state first)

These routes try `behavioural_state_current` first; if missing, call `tryRecomputeWithCooldown` then read again; if still missing, fall back to legacy (getProgress, loadConnectionDepth, getUserTraits, etc.):

- GET /api/progress
- GET /api/connection-depth
- GET /api/connection-index
- GET /api/identity
- GET /api/themes
- GET /api/loops
- GET /api/distortions
- GET /api/traits

Cooldown: do not recompute if `last_computed_at` is within the last 60 seconds.

---

## Exceptions (.vella/ or localStorage still written)

| File | Line / area | What |
|------|-------------|------|
| lib/progress/updateProgress.ts | serverLocalSet(`progress_metrics:${userId}`) | Progress payload (journalStreak, etc.) still written to .vella/ |
| lib/progress/checkAchievements.ts | serverLocalSet(progress_metrics), serverLocalSet(ACHIEVEMENTS_KEY) | Achievements + progress_metrics |
| lib/ai/reciprocity.ts | serverLocalSet(`connection_depth:${userId}`) | connection_depth after reciprocity |
| lib/goals/goalEngine.ts | serverLocalSet(goals), serverLocalSet(goal_actions) | Goals in .vella/ until Phase 6B |
| lib/local/traitsLocal.ts | saveLocalTraits, appendLocalTraitHistory | traits (localStorage) when upsertUserTraits is used |
| lib/fast/cacheStore.ts | serverLocalSet(micro_rag_cache) | Micro-RAG cache |
| lib/social/saveSocialModel.ts | serverLocalSet(social_models) | Social model |
| lib/personality/updatePersonalityProfile.ts | serverLocalSet(vella_personality) | Personality profile |
| lib/audit/logger.ts | serverLocalSet(audit events) | Audit log |

Blocked for Phase 6A (no-op): `lib/progress/saveProgress.ts`, `lib/connection/saveConnectionDepth.ts`.

---

## Verification checklist

- [ ] `pnpm run build` exits 0
- [ ] GET /api/state/current returns `{ version: 0, state: { traits: {}, themes: [], ... }, lastComputedAtISO: undefined, updatedAtISO: undefined }` when no row
- [ ] POST /api/state/recompute (body `{}`) creates/updates row; GET /api/state/current then returns version ≥ 1 and state with metadata.sources
- [ ] POST /api/state/recompute with body `{ snapshotType: "triggered" }` inserts into behavioural_state_history; GET /api/state/history returns at least one row
- [ ] GET /api/progress, /api/connection-depth, /api/identity, /api/themes, /api/loops, /api/distortions, /api/traits return valid JSON (from state or legacy)

All tests with one authenticated user (session cookie or bearer).
