# STRICT READ-ONLY FORENSIC AUDIT — Vella Backend Layer Map (Evidence Only)

**Rule:** Supabase stores SAFE METADATA ONLY. No PII/free-text in Supabase.  
**Scope:** MOBILE backend. No code changes. Every claim cites file paths + line numbers.

---

## 1) Executive Summary

- **Supabase access is gated by an allowlist:** All reads/writes go through `fromSafe(table)` (admin) or `supabase.from(table)` (client); both call `assertSafeTable(table)`. Only tables listed in `lib/supabase/safeTables.ts` (lines 5–40) are permitted. Evidence: `lib/supabase/admin.ts` (34–40), `lib/supabase/client.ts` (32–35).

- **Free-text is still written to Supabase in several paths:** Journal (title, content), check-ins (note), conversation_messages (content), memory_chunks (content), user_reports (summary) are written directly via `fromSafe().insert()/.update()` without using `safeSupabaseWrite`; the banned-field guard (`content`, `text`, `summary`, etc.) exists in `lib/safe/safeSupabaseWrite.ts` (19–34) but is only used by Stripe webhook and profile upsert (profile upsert is a no-op). Evidence: `BACKEND_COMPLIANCE_AND_WIRING_PLAN.md` (14–27), `lib/journal/db.ts` (70–71, 87–88), `lib/checkins/db.ts` (84, 105), `lib/conversation/db.ts` (67), `lib/memory/db.ts` (57, 105), `app/api/reports/create/route.ts` (37–45).

- **Deterministic engines are clearly separated:** Behavioural state: `recomputeState` (lib/engine/behavioural/recomputeState.ts) reads profiles, vella_settings, subscriptions, journal_entries, check_ins, conversation_messages, user_goals (counts only), writes only behavioural_state_current + behavioural_state_history with counts/metadata (129–171). Governance: `computeGovernanceState` (lib/governance/stateEngine.ts) reads behaviour_events, commitments, abstinence_targets, focus_sessions; writes only governance_state (140). No LLM in these paths.

- **LLM usage is confined to specific modules:** Text completion: `lib/ai/textEngine.ts` (runVellaTextCompletion, line 18). Conversational/insight agents: `lib/ai/agents.ts` (runConversationalGuide 930, clarity/strategy/deepdive/compass/emotion/attachment/identity). Embeddings: `lib/ai/embeddings.ts`, `lib/memory/embed.ts`. Memory summariser: `lib/memory/summariser.ts`. Persona insights: `lib/insights/generatePersonaInsights.ts`. Intent classifier: `lib/ai/intent/classifier.ts`. All use `openai` from `lib/ai/client.ts` (6).

- **Dual persistence (serverLocal + Supabase) exists for several domains:** Goals and goal actions: serverLocal only (`goals:${uid}`, `goal_actions:${uid}`) — `lib/goals/goalEngine.ts` (37–44, 51–82). Progress metrics and achievements: serverLocal (`progress_metrics:${userId}`, `achievements:${userId}`) — `lib/progress/loadProgress.ts` (30), `lib/progress/updateProgress.ts` (90), `lib/progress/checkAchievements.ts` (25, 33, 73), `lib/progress/loadAchievements.ts` (19). Connection depth: read from serverLocal (`connection_depth:${userId}`) in `lib/connection/loadConnectionDepth.ts` (8); canonical durable value is in behavioural_state_current.state_json (recomputeState 128), but saveConnectionDepth is a no-op (lib/connection/saveConnectionDepth.ts 7–9).

---

## 2) Layer Inventory Table

| Layer Name | Purpose | Entry Points (API routes) | Core Modules (files) | Reads | Writes | Persistence | LLM or Deterministic | PII Risk Surface | Invariants/Guards |
|------------|---------|---------------------------|----------------------|-------|--------|-------------|----------------------|------------------|-------------------|
| **Journal** | Durable journal CRUD | POST/GET/PUT/PATCH/DELETE `/api/journal` | `lib/journal/db.ts`, `lib/journal/server.ts` | journal_entries (34–55) | journal_entries: title, content (70–71, 87–88) | Supabase journal_entries | Deterministic (no LLM in db layer) | **Yes.** title, content are user free-text. No safeSupabaseWrite; fromSafe only. Length caps in journalCreateSchema/journalUpdateSchema (lib/security/validationSchemas.ts 71–86). | validationSchemas: text max 10000, title max 200 (75, 74). .strict() on schemas. |
| **Check-ins** | Durable check-in CRUD | POST/GET/PATCH/DELETE `/api/check-ins` | `lib/checkins/db.ts` | check_ins (40–61) | check_ins: note, mood, stress, energy, focus (84–86, 105) | Supabase check_ins | Deterministic | **Yes.** note is user free-text (lib/checkins/db.ts 84). BANNED_FIELDS would block key "content" but not "note". No safeSupabaseWrite used. | Check-in schema in route (Zod); note can be present. |
| **Conversation** | Persist user/assistant messages | Called from `/api/vella/text` | `lib/conversation/db.ts` | conversation_messages (35–54) | conversation_messages: content (67) | Supabase conversation_messages | LLM downstream (text route calls textEngine) | **Yes.** content is full message text (57–67). BANNED_FIELDS includes "content" (safeSupabaseWrite 19); vella/text uses fromSafe().insert() not safeInsert. | vellaTextRequestSchema: message max 4000 (validationSchemas 37). |
| **Behavioural state** | Deterministic progress/connection state | GET `/api/state/current`, GET `/api/behavioural-state`, POST `/api/state/recompute`, GET `/api/state/history`; also progress, connection-depth, connection-index, traits, themes, loops, distortions, identity | `lib/engine/behavioural/recomputeState.ts`, `lib/engine/behavioural/getState.ts` | profiles, vella_settings, subscriptions, journal_entries, check_ins, conversation_messages, user_goals (74–110), behavioural_state_current (142) | behavioural_state_current (158), behavioural_state_history (171) | Supabase only. state_json: progress counts, connection_depth, metadata (129–139). No free-text. | Deterministic | **No.** recomputeState writes only counts and metadata (BACKEND_COMPLIANCE 27). traits/themes/loops/distortions in state are EMPTY. | assertSafeTable; no free-text keys in state. |
| **Governance events** | Append-only behaviour events | No direct API yet; used by engines | `lib/governance/events.ts`, `lib/governance/validation.ts` | — | behaviour_events (events.ts 95) | Supabase behaviour_events | Deterministic | **No.** validateGovernancePayload("BehaviourEventInsert") enforces enums and metadata_code only (validation.ts 92–101, 79). | Governance validation: event_type, subject_code enums; metadata_code optional record of number/code/timestamp. |
| **Governance state** | Deterministic governance state | Cron `/api/internal/governance/daily`; no user-facing read API yet | `lib/governance/stateEngine.ts` | behaviour_events, commitments, abstinence_targets, focus_sessions (50–65) | governance_state (140) | Supabase governance_state | Deterministic | **No.** state_json flat keys, values number/code/timestamp only; validateGovernancePayload("GovernanceStateUpdate") (stateEngine 131, validation 142–149). | GovernanceStateUpdateSchema: state_json z.record(code/timestamp/number). |
| **Goals** | Goals and goal actions CRUD | `/api/goals` | `lib/goals/goalEngine.ts` | serverLocal get: goals:${uid}, goal_actions:${uid} (51, 71) | serverLocal set: same keys (62, 82) | serverLocal only (.vella/*.json) | Deterministic | **Local only.** Title, description, label are free-text but stored in serverLocal (goalEngine 13–14, 26); not Supabase. | No Supabase write. |
| **Progress / achievements** | Progress metrics and achievement badges | `/api/progress`; checkAchievements called from app | `lib/progress/loadProgress.ts`, `lib/progress/updateProgress.ts`, `lib/progress/checkAchievements.ts`, `lib/progress/loadAchievements.ts` | serverLocal: progress_metrics:${userId}, achievements:${userId} (loadProgress 30, loadAchievements 19) | serverLocal: progress_metrics, achievements (updateProgress 90, checkAchievements 33, 73) | serverLocal | Deterministic (streak/trend rules in checkAchievements) | **No.** Numeric scores and achievement keys only. | saveProgress is no-op (saveProgress.ts 9–15); progress in state is in behavioural_state_current. |
| **Connection depth** | Connection score | `/api/connection-depth`, `/api/connection-index`; realtime/reciprocity | `lib/connection/loadConnectionDepth.ts`, `lib/connection/depthEngine.ts`, `lib/connection/saveConnectionDepth.ts` | serverLocal connection_depth:${userId} (loadConnectionDepth 8); depthEngine 166; getState reads behavioural_state_current | saveConnectionDepth no-op (7–9); recomputeState writes connection_depth into state_json | serverLocal read path; canonical durable in behavioural_state_current | Deterministic (depthEngine formula) | **No.** Depth is numeric. | No free-text. |
| **Memory / RAG** | Chunk and embed content for retrieval | POST `/api/memory/chunk`, `/api/memory/reindex`; embed route | `lib/memory/db.ts`, `lib/memory/retrieve.ts`, `app/api/memory/chunk/route.ts`, `app/api/memory/reindex/route.ts` | journal_entries (chunk 48, reindex 54), conversation_messages (55, 65), behavioural_state_history (70, 85) | memory_chunks: content, content_hash (db 57, 105); memory_embed_jobs | Supabase memory_chunks, memory_embed_jobs | LLM/embed: embeddings.ts, embed.ts | **Yes.** memory_chunks.content holds chunk text (db 57). fromSafe used; no safeSupabaseWrite. BANNED_FIELDS would block "content". | No guard on content in this path. |
| **Subscriptions / Stripe** | Billing and webhooks | `/api/stripe/webhook`, `/api/stripe/create-checkout-session`, `/api/stripe/portal`, `/api/stripe/token-pack` | `lib/payments/webhookIdempotency.ts`, stripe routes | subscriptions (webhook 148, 164, 246, 294, 327), webhook_events (20, 46, 87) | subscriptions (safeUpdate/safeInsert 170, 226, 254, 303, 312), webhook_events (46, 87) | Supabase | Deterministic (no LLM) | **No.** safeInsert/safeUpdate used (webhook 170, 226, 254, 303, 312); scanPayload blocks banned keys. | safeSupabaseWrite + bypassWriteLock for webhook. |
| **Token usage / budget** | Usage and quotas | Used by text/realtime/audio flows; `/api/account/export` | `lib/budget/usageServer.ts`, `lib/tokens/enforceTokenLimits.ts` | token_usage (72) | token_usage (46) | Supabase token_usage | Deterministic | **No.** Only user_id, source, tokens, from_allocation (usageServer 47–53). | No content stored. |
| **Feedback** | Rating and category | POST `/api/feedback/create` | `app/api/feedback/create/route.ts` | — | feedback: user_id, session_id, rating, channel, category (40–45). Body has message (max 2000) but **not** inserted. | Supabase feedback | Deterministic | **No.** Insert omits message (39–44). | bodySchema allows message but it is not persisted. |
| **User reports** | User-submitted reports | POST `/api/reports/create` | `app/api/reports/create/route.ts` | — | user_reports: summary, type, severity, etc. (37–45) | Supabase user_reports | Deterministic | **Yes.** summary is 1–2000 chars (bodySchema 11); written to Supabase. | Zod max 2000; no safeSupabaseWrite (BANNED_FIELDS has "summary"). |
| **Insights / themes / traits** | Themes, traits, loops, distortions | GET `/api/themes`, `/api/traits`, `/api/loops`, `/api/distortions`, `/api/identity` | `lib/engine/behavioural/getState.ts`, `lib/themes/getLifeThemes.ts`, `lib/traits/adaptiveTraits.ts`, `lib/loops/getBehaviourLoops.ts`, `lib/distortions/getCognitiveDistortions.ts`, `lib/insights/identity.ts` | behavioural_state_current (getState 19, 40); legacy: themes/traits/loops/distortions/identity (themes route 43–48) | None from themes/traits/loops/distortions routes; traits POST upsertUserTraits (traits route 52) | Read: Supabase state or legacy; write traits may hit Supabase if user_traits table used | LLM in legacy getLifeThemes, getBehaviourLoops, getCognitiveDistortions, identity (depends on implementation) | State path: no free-text in state. Legacy paths may use LLM and return derived labels. | getState + tryRecomputeWithCooldown; state preferred, fallback legacy. |
| **Vella text** | Chat completion and persistence | POST `/api/vella/text` | `app/api/vella/text/route.ts`, `lib/ai/textEngine.ts`, `lib/conversation/db.ts` | Memory retrieve, state; journal/conversation for context | conversation_messages (insert 127, 128, 152, 187 per BACKEND_COMPLIANCE 19) | Supabase conversation_messages | LLM (runVellaTextCompletion) | **Yes.** User and assistant content written to conversation_messages. vellaTextRequestSchema caps message 4000 (validationSchemas 37). | No safeInsert; fromSafe().insert(). |
| **Daily governance cron** | Batch compute governance state | GET/POST `/api/internal/governance/daily` | `app/api/internal/governance/daily/route.ts`, `lib/governance/stateEngine.ts` | profiles (38), behaviour_events, commitments, abstinence_targets, focus_sessions (stateEngine 50–64) | governance_state (stateEngine 140) | Supabase | Deterministic | **No.** Only user IDs and computed codes/numbers. | Cron secret (x-cron-secret or Bearer); no user content. |

---

## 3) Source of Truth Map

| Domain | Canonical storage | Derived / secondary storage | Evidence |
|--------|-------------------|-----------------------------|----------|
| **Check-ins** | Supabase `check_ins` | recomputeState reads counts only (recomputeState 98–102). No serverLocal for check-ins. | lib/checkins/db.ts 40–117; recomputeState 98–102. |
| **Journals** | Supabase `journal_entries` | recomputeState reads counts only (94–96). Memory chunking reads title/content (memory/chunk 48, reindex 54). No serverLocal for journal body. | lib/journal/db.ts 34–99; recomputeState 94–96. |
| **Conversation messages** | Supabase `conversation_messages` | recomputeState reads count (103–106). Memory chunking reads content (chunk 55–66, reindex 65–80). No serverLocal. | lib/conversation/db.ts 35–73; recomputeState 103–106. |
| **Goals + goal actions** | serverLocal `goals:${uid}`, `goal_actions:${uid}` | Supabase `user_goals` exists in types/safeTables; recomputeState counts user_goals rows (109). goalEngine does not use Supabase (goalEngine 4, 51–82). | lib/goals/goalEngine.ts 37–44, 51–82; recomputeState 109. |
| **behavioural_state_current / history** | Supabase `behavioural_state_current`, `behavioural_state_history` | Single writer: recomputeState (158, 171). state_json: progress (counts), connection_depth, metadata (129–139). No serverLocal for this state. | lib/engine/behavioural/recomputeState.ts 129–171; getState 19, 40. |
| **Progress metrics** | serverLocal `progress_metrics:${userId}` | behavioural_state_current.state_json.progress has counts (journal_count, etc.); saveProgress is no-op; loadProgress/updateProgress/checkAchievements use serverLocal. | lib/progress/loadProgress.ts 30; updateProgress 90; checkAchievements 73; saveProgress 9–15. |
| **Connection depth** | behavioural_state_current.state_json.connection_depth (recomputed) | serverLocal `connection_depth:${userId}` read by loadConnectionDepth and depthEngine; saveConnectionDepth is no-op. | lib/connection/loadConnectionDepth.ts 8; saveConnectionDepth 7–9; depthEngine 166; recomputeState 128. |
| **Achievements** | serverLocal `achievements:${userId}` (key pattern ACHIEVEMENTS_KEY in checkAchievements 21) | Supabase `achievements` in safeTables but no fromSafe("achievements") in codebase for writes; progress/achievement logic in checkAchievements. | lib/progress/checkAchievements.ts 21, 25, 33; loadAchievements 19. |
| **Budgets / quotas** | Supabase `token_usage` (and plan/subscription) | serverLocal `vella_token_usage:${userId}` used in hooks/counterEngine (useSessionOrchestrator 75, logTokenUsage 38, counterEngine 116). Server authoritative: usageServer recordUsageToSupabase (46), getServerUsageForUser (72). | lib/budget/usageServer.ts 46, 72; lib/tokens/logTokenUsage.ts 38. |
| **Governance state** | Supabase `governance_state` | Computed from behaviour_events, commitments, abstinence_targets, focus_sessions. No serverLocal. | lib/governance/stateEngine.ts 50–64, 140. |
| **Governance events** | Supabase `behaviour_events` | Append-only. No derived cache. | lib/governance/events.ts 95, 123. |
| **Commitments / abstinence / focus_sessions** | Supabase `commitments`, `abstinence_targets`, `focus_sessions` | Read only by governance stateEngine. | stateEngine 56–64. |
| **Profiles** | Supabase `profiles` (if written by Auth or other) | upsertProfile is no-op (lib/profile/upsertProfile.ts 15–18). Read by recomputeState, greetings, personaServer. | recomputeState 75; lib/home/greetings.ts 111; lib/ai/personaServer.ts 22–23. |
| **Vella settings / personality / social** | Supabase vella_settings; serverLocal vella_personality, social_models | getPersonalityProfile: serverLocal `vella_personality:${userId}` (30). loadSocialModel/saveSocialModel: serverLocal `social_models:${userId}` (8, 8). | lib/personality/getPersonalityProfile.ts 30; lib/social/loadSocialModel.ts 8; lib/social/saveSocialModel.ts 8. |

---

## 4) Guardrails & Compliance Mechanisms

| Mechanism | Purpose | Evidence (file + line) |
|-----------|---------|------------------------|
| **SAFE_TABLES allowlist** | Restrict Supabase to known tables only. | `lib/supabase/safeTables.ts`: SAFE_TABLE_VALUES (5–40), assertSafeTable (45–54). |
| **fromSafe / assertSafeTable** | Every admin Supabase access must use fromSafe(table); assertSafeTable runs on table name. | `lib/supabase/admin.ts`: wrapMetadataClient calls assertSafeTable (37–38); fromSafe calls assertSafeTable (56). |
| **Client Supabase assertSafeTable** | Browser client also restricted to same table list. | `lib/supabase/client.ts`: createClientInstance wraps .from with assertSafeTable (33–34). |
| **BANNED_FIELDS (safeSupabaseWrite)** | Block payload keys: content, text, summary, transcript, free_text, prompt, response. | `lib/safe/safeSupabaseWrite.ts`: BANNED_FIELDS (19), scanPayload (21–34). |
| **safeInsert / safeUpdate / safeUpsert** | Insert/update/upsert with scanPayload and write-lock check. | `lib/safe/safeSupabaseWrite.ts`: safeInsert (52–61), safeUpdate (64–73), safeUpsert (76–85). |
| **Usage of safe* in codebase** | Only Stripe webhook and profile upsert use safe*; profile upsert is no-op. | `app/api/stripe/webhook/route.ts`: safeUpdate (170, 254, 303), safeInsert (226, 312). `lib/profile/upsertProfile.ts`: safeUpsert imported but function is no-op (4, 15–18). |
| **Zod request schemas (length limits)** | journalCreateSchema, journalUpdateSchema: text max 10000, title max 200. | `lib/security/validationSchemas.ts`: 71–86. |
| **vellaTextRequestSchema** | message max 4000, language max 10, session_id uuid optional. | `lib/security/validationSchemas.ts`: 36–41, .strict(). |
| **Governance validation** | validateGovernancePayload(schemaName, payload); enums and metadata-only for governance tables. | `lib/governance/validation.ts`: BehaviourEventInsertSchema (92–101), GovernanceStateUpdateSchema (142–149), validateGovernancePayload (188–195). |
| **Governance state_json schema** | state_json: z.record(string max 50, number | codeString | isoTimestampString). | `lib/governance/validation.ts`: 136–140, 142–149. |
| **WRITE_LOCK_MODE (killSwitch)** | When enabled, only bypassWriteLock (e.g. webhook) can write. | `lib/safe/safeSupabaseWrite.ts`: ensureWriteLockAllowed (44–49); Stripe webhook passes bypassWriteLock true (303, 312). |
| **Feedback route** | Body schema has message (max 2000) but insert does not persist message. | `app/api/feedback/create/route.ts`: bodySchema (8–14), insert (39–44) — no message field. |
| **Reports route** | summary 1–2000 chars persisted; BANNED_FIELDS would block "summary" if safeInsert were used. | `app/api/reports/create/route.ts`: bodySchema (11), insert (37–45). safeInsert not used. |

---

## 5) Layer Dependencies Graph (Text)

- **Data → Layers**
  - **journal_entries:** Read by: Journal API (db), recomputeState (counts), memory/chunk, memory/reindex. Written by: Journal API (db).
  - **check_ins:** Read by: Check-ins API (db), recomputeState (counts). Written by: Check-ins API (db).
  - **conversation_messages:** Read by: conversation db, recomputeState (counts), memory/chunk, memory/reindex. Written by: vella/text (conversation db insert).
  - **behavioural_state_current / history:** Read by: getState, state/current, behavioural-state, progress, connection-depth, connection-index, themes, traits, loops, distortions, identity, memory/chunk (history). Written by: recomputeState only.
  - **behaviour_events, commitments, abstinence_targets, focus_sessions:** Read by: governance stateEngine. Written by: governance events (behaviour_events only); commitments/abstinence/focus_sessions written by future/other flows.
  - **governance_state:** Written by: stateEngine (computeGovernanceState). Read by: (no API in audit scope).
  - **profiles:** Read by: recomputeState, internal/governance/daily (list user ids), greetings, personaServer.
  - **token_usage:** Read by: usageServer getServerUsageForUser; written by: usageServer recordUsageToSupabase.
  - **serverLocal goals / goal_actions:** Read/written only by goalEngine. recomputeState does not read serverLocal; it counts user_goals (Supabase) if that table is populated elsewhere.
  - **serverLocal progress_metrics, achievements, connection_depth, vella_personality, social_models, micro_rag_cache:** Read/written by progress, connection, personality, social, fast/cacheStore modules; connection_depth canonical is also in behavioural_state_current.

- **Engines called**
  - **recomputeState:** Called from POST /api/state/recompute (route 55) and getState tryRecomputeWithCooldown (getState 52). Inputs: userId, optional snapshotType, window. Outputs: behavioural_state_current, behavioural_state_history.
  - **computeGovernanceState:** Called from /api/internal/governance/daily for each user (daily route runDailyGovernance, then stateEngine.computeGovernanceState). Inputs: userId. Outputs: governance_state.
  - **recordEvent:** Governance events engine; no API route in scope; writes behaviour_events after validateGovernancePayload.

- **LLM call sites**
  - **runVellaTextCompletion** (lib/ai/textEngine.ts 18): Used by /api/vella/text.
  - **runConversationalGuide** (lib/ai/agents.ts 930): Used by realtime/conversational flows; not by /api/vella/text per BACKEND_COMPLIANCE.
  - **openai.chat.completions.create / embeddings.create:** agents.ts (538, 573, 612, 651, 684, 721, 753, 783, 1099), textEngine, summariser (27), generatePersonaInsights (126), embeddings (94), intent/classifier (52), fullAI (62), hse/engine (36). Memory embed: lib/memory/embed.ts (26).

- **Deterministic recomputation**
  - **recomputeState:** Full recompute from source tables; writes state_json with progress counts, connection_depth, metadata (recomputeState 66–177).
  - **computeGovernanceState:** Reads governance tables; computes recovery_state, discipline_state, focus_state, governance_risk_score, escalation_level; upserts governance_state (stateEngine 39–145).
  - **tryRecomputeWithCooldown:** Calls recomputeState if no row or last_computed_at older than COOLDOWN_MS (getState 37–52).

- **Dependency flow (simplified)**
  - User → Journal / Check-ins / Goals (serverLocal) / Vella text → Supabase or serverLocal.
  - Cron → /api/internal/governance/daily → profiles (list ids) → computeGovernanceState per user → governance_state.
  - User → GET state/themes/traits/loops/distortions → getState (behavioural_state_current) or tryRecomputeWithCooldown → recomputeState → then getState; or legacy getLifeThemes/getUserTraits/etc.
  - User → POST /api/vella/text → vellaTextRequestSchema → runVellaTextCompletion (LLM) → insertConversationMessage (Supabase content).
  - Stripe webhook → safeUpdate/safeInsert (subscriptions, webhook_events) → scanPayload blocks banned keys.

---

**End of audit. No code was modified. All claims traceable to file paths and line numbers above.**
