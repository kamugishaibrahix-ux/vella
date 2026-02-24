# STRICT READ-ONLY — Governance Layer Attachment Plan (Evidence Only)

**Objective:** Identify exact safe attachment points to add a governance layer (events/state) without breaking existing layers. No schema design. No code. Evidence only.

---

## 1) Existing Write Paths and Ownership

### 1.1 Who writes behavioural_state_current?

| Owner | File | Function / call site | Evidence (file:line) |
|-------|------|----------------------|----------------------|
| **Single writer** | `lib/engine/behavioural/recomputeState.ts` | `recomputeState` | Upsert: `fromSafe("behavioural_state_current").upsert(...)` at **158–160**. Insert to history: `fromSafe("behavioural_state_history").insert(...)` at **171**. |
| **Callers of recomputeState** | `app/api/state/recompute/route.ts` | POST handler | **55:** `await recomputeState({ userId, snapshotType, window, reason: "api_recompute" })`. |
| | `lib/engine/behavioural/getState.ts` | `tryRecomputeWithCooldown` | **52:** `await recomputeState({ userId, reason: "cooldown_refresh" }).catch(() => {})`. |

**Evidence:** No other file performs `.upsert()` or `.insert()` on `behavioural_state_current`. `saveConnectionDepth` and `saveProgress` are no-ops and do not write to Supabase (`lib/connection/saveConnectionDepth.ts` 7–9, `lib/progress/saveProgress.ts` 9–15).

---

### 1.2 Who writes check_ins / journal_entries / conversation_messages?

| Table | Writer module | Entry point (API or server) | Evidence (file:line) |
|-------|---------------|-----------------------------|----------------------|
| **check_ins** | `lib/checkins/db.ts` | `createCheckInInDb` (insert **84–86**), `updateCheckInInDb` (update **105–106**). | Called from `app/api/check-ins/route.ts`: POST **89** `createCheckInInDb(userId, parsed.data)`; PATCH uses `updateCheckInInDb` (check-ins route). |
| **journal_entries** | `lib/journal/db.ts` | `createJournalEntryInDb` (insert **70–71**), `updateJournalEntryInDb` (update **87–88**). | Called from `lib/journal/server.ts` **47** `createJournalEntryInDb(userId, { title, content })`; server used by `app/api/journal/route.ts` (POST/PUT/PATCH). |
| **conversation_messages** | `lib/conversation/db.ts` | `insertConversationMessage` (insert **67–68**). | Called from `app/api/vella/text/route.ts` **128, 129, 153, 188** (user + assistant message persistence). |

No other modules write to these three tables. Evidence: grep for `fromSafe("check_ins")`, `fromSafe("journal_entries")`, `fromSafe("conversation_messages")` shows only the above db modules and no other callers for writes.

---

### 1.3 What is serverLocal used for?

| Key pattern | Writer (file:line) | Reader (file:line) | Purpose |
|-------------|--------------------|--------------------|---------|
| `goals:${uid}` | `lib/goals/goalEngine.ts` **62** `serverLocalSet(key, goals)` | **51** `serverLocalGet(key)` | Goals list. |
| `goal_actions:${uid}` | `lib/goals/goalEngine.ts` **82** `serverLocalSet(key, actions)` | **71** `serverLocalGet(key)` | Goal actions. |
| `progress_metrics:${userId}` | `lib/progress/updateProgress.ts` **90**; `lib/progress/checkAchievements.ts` **73** | `lib/progress/loadProgress.ts` **30** | Progress metrics (consistency, streaks, etc.). |
| `achievements:${userId}` | `lib/progress/checkAchievements.ts` **33** `serverLocalSet(ACHIEVEMENTS_KEY(userId), achievements)` | **25** `serverLocalGet(ACHIEVEMENTS_KEY(userId))`; `lib/progress/loadAchievements.ts` **19** | Achievement badges. ACHIEVEMENTS_KEY = `achievements:${userId}` (**21**). |
| `connection_depth:${userId}` | `lib/ai/reciprocity.ts` **105** `serverLocalSet(...)` | `lib/connection/loadConnectionDepth.ts` **8**; `lib/connection/depthEngine.ts` **166**; `lib/ai/reciprocity.ts` **38** | Connection depth (legacy read path). |
| `micro_rag_cache:${userId}` | `lib/fast/cacheStore.ts` **20** | **8** | Micro-RAG cache. |
| `social_models:${userId}` | `lib/social/saveSocialModel.ts` **8** | `lib/social/loadSocialModel.ts` **8** | Social model. |
| `vella_personality:${userId}` | `lib/personality/updatePersonalityProfile.ts` **22** | `lib/personality/getPersonalityProfile.ts` **30** | Personality profile. |
| `profiles:${userId}` | (not written in codebase; may be populated elsewhere) | `lib/home/greetings.ts` **111**; `lib/ai/personaServer.ts` **23** | Profile cache. |
| Audit key | `lib/audit/logger.ts` **27** `serverLocalSet(key, events)` | **14** `serverLocalGet(key)` | Audit events. |

**Storage implementation:** `lib/local/serverLocal.ts` **14–28**: `serverLocalGet(key)` / `serverLocalSet(key, value)`; path `process.cwd() + "/.vella"`; file `${key}.json`.

---

## 2) Existing Read Paths That Would Be Impacted If New Tables Existed

### 2.1 Routes that read behavioural_state_current (no assumption it is the “only” state table)

| Route | How it reads state | Fallback / aggregation | Evidence (file:line) |
|-------|--------------------|------------------------|----------------------|
| GET `/api/state/current` | Direct `fromSafe("behavioural_state_current").select(...).eq("user_id", userId).maybeSingle()` | If no row: returns default empty state (version 0). No other table read. | `app/api/state/current/route.ts` **43–45**, **52–55**. |
| GET `/api/behavioural-state` | Same: direct `fromSafe("behavioural_state_current")` | If no data: returns state: null, version: 0. | `app/api/behavioural-state/route.ts` **33–35**, **43–49**. |
| GET `/api/progress` | `getBehaviouralStateForUser(userId)` then `state?.state?.progress` | If state missing: `tryRecomputeWithCooldown` then re-read; else progress from `getProgress(userId)` (serverLocal/calculateProgress). | `app/api/progress/route.ts` **25–31**. |
| GET `/api/connection-depth` | `getBehaviouralStateForUser` then `state?.state?.connection_depth` | Else `loadConnectionDepth(userId)` (serverLocal). | `app/api/connection-depth/route.ts` **25–31**. |
| GET `/api/connection-index` | `getBehaviouralStateForUser` then state used for connection index | Same tryRecompute + state read pattern. | `app/api/connection-index/route.ts` **25–28**. |
| GET `/api/themes` | `getBehaviouralStateForUser` then `state?.state` (themes, traits, loops, distortions) | If state present: return from state (currently empty for themes/loops/distortions). If not: **fallback** `getLifeThemes`, `getUserTraits`, `getBehaviourLoops`, `getCognitiveDistortions`, `extractStrengthsAndValues`. | `app/api/themes/route.ts` **27–48**. |
| GET `/api/traits` | Same getState + state.state.traits | Fallback `getUserTraits(userId)`. | `app/api/traits/route.ts` **24–30**. |
| GET `/api/loops` | Same getState + state.state.loops | Fallback `getBehaviourLoops(userId)`. | `app/api/loops/route.ts` **28–34**. |
| GET `/api/distortions` | Same getState + state.state.distortions | Fallback `getCognitiveDistortions(userId)`. | `app/api/distortions/route.ts` **28–34**. |
| GET `/api/identity` | Same getState + state | Fallback identity logic. | `app/api/identity/route.ts` **30–33**. |

**Conclusion from evidence:** No route **assumes** behavioural_state_current is the only state table. They either read only that table for “current state” or use state first and fall back to legacy (themes/traits/loops/distortions) or serverLocal (progress, connection_depth). Adding a **separate** table (e.g. governance_state) does not force any of these to change, because they do not join state with another table and do not reference governance.

### 2.2 Joins, aggregations, fallbacks

| Location | Behaviour | Evidence (file:line) |
|----------|-----------|----------------------|
| **recomputeState** | Reads journal_entries, check_ins, conversation_messages, user_goals for **counts only** (no JOIN with behavioural_state_current; builds new state from scratch and upserts). | `lib/engine/behavioural/recomputeState.ts` **91–114**, **129–160**. |
| **getState** | Single-table read: `behavioural_state_current` only. No JOIN. | `lib/engine/behavioural/getState.ts` **19–21**, **39–41**. |
| **state/history** | Reads `behavioural_state_history` only; no JOIN with current. | `app/api/state/history/route.ts` **44–54**. |
| **memory/chunk** | Reads journal_entries, conversation_messages, or behavioural_state_history by source; no JOIN of current with history. | `app/api/memory/chunk/route.ts` **48**, **55–63**, **70–74**. |
| **memory/reindex** | Same: journal, conversation, behavioural_state_history separately; chunks built per source. | `app/api/memory/reindex/route.ts` **54**, **65**, **85–91**. |

**Evidence:** No code path joins `behavioural_state_current` with another table or assumes a single “state” table. Fallbacks are either legacy LLM/heuristic modules or serverLocal.

---

## 3) Safest Integration Strategy (Evidence-Based)

### 3.1 Parallel governance_state table vs extending behavioural_state_current.state_json

| Criterion | Evidence | Conclusion |
|-----------|----------|------------|
| **Single writer** | behavioural_state_current has exactly one writer: `recomputeState` (recomputeState.ts **158**). | Extending state_json would require recomputeState to either (a) read governance tables and merge into state_json, or (b) a second writer for state_json. (a) couples governance to behavioural state; (b) introduces a second writer and breaks single-ownership. |
| **Schema semantics** | state_json is defined as progress, connection_depth, metadata, and empty traits/themes/loops/distortions (recomputeState **129–139**). Governance state has different semantics (recovery_state, discipline_state, focus_state, risk, escalation). | Mixing both in one blob blurs ownership and makes “who can write what” ambiguous. |
| **Existing governance_state** | governance_state table and stateEngine already exist; stateEngine explicitly “Does not modify behavioural_state_current” (stateEngine.ts **6**, **38**). | Parallel table is already the implemented design; no evidence of any reader of behavioural_state_current that expects governance fields. |
| **Risk** | If governance were put in state_json: every reader of state (progress, connection-depth, themes routes) would see new keys; validation and type expectations would need to change in multiple places (getState return type, route handlers). | Parallel table: zero changes to existing state readers; only new code reads governance_state. |

**Verdict:** **Parallel `governance_state` table.** Justification: single-writer invariant for behavioural_state_current; separate semantics; existing stateEngine design; no impact on current read paths.

### 3.2 Separate API routes vs augmenting existing routes

| Criterion | Evidence | Conclusion |
|-----------|----------|------------|
| **Current state surface** | GET /api/state/current and /api/behavioural-state return only behavioural state (state_json, version, timestamps). No governance. | Adding governance to the same response would **augment** the contract; all existing clients would receive new keys or a new nested object. |
| **Progress/connection-depth** | They use state for progress and connection_depth only (progress route **29–31**, connection-depth **29–31**). They do not need governance. | Augmenting these routes with governance would mix concerns and force clients that only need progress/depth to handle governance. |
| **Cron** | Governance is already updated by a separate entry point: `/api/internal/governance/daily` (daily route), which does not touch state/current or progress. | No existing route is the “owner” of governance; a dedicated read route (e.g. GET /api/governance/state) keeps ownership clear. |

**Verdict:** **Separate API routes for governance.** Justification: existing routes have no governance contract; adding governance there would broaden contracts and mix concerns; cron is already separate; a dedicated read route preserves single responsibility and avoids touching existing route logic.

---

## 4) Required Allowlist / Type Updates for New Supabase Tables

Any **new** Supabase table (not already in the list below) must be:

| Location | What to update | Evidence (file:line) |
|----------|----------------|----------------------|
| **Allowlist** | Add table name to `SAFE_TABLE_VALUES` array. | `lib/supabase/safeTables.ts` **5–40**. Type `SafeTableName` is derived from this list and `Database["public"]["Tables"]` (**41–42**). |
| **Types** | Add table to `Database["public"]["Tables"]` with `Row`, `Insert`, `Update` (and Enums if new enum types). | `lib/supabase/types.ts`: Tables start **12** (profiles); governance tables already present (behaviour_events, commitments, abstinence_targets, focus_sessions, governance_state). For any **new** table, add a new key under `Tables` and, if applicable, under `Enums`. |

**Current governance tables already present:** safeTables.ts contains `abstinence_targets`, `behaviour_events`, `commitments`, `focus_sessions`, `governance_state` (**9**, **12**, **14**, **15**, **16**). types.ts contains corresponding Table and Enum definitions. No additional allowlist/type locations exist; both are the single source of truth for “allowed tables” and TypeScript shapes.

---

## 5) Attachment Plan — “Where to Add” (File + Line Anchors)

| Attachment point | Purpose | File | Line / region | Evidence |
|------------------|---------|------|----------------|----------|
| **New table allowlist** | If adding a table not in safeTables | `lib/supabase/safeTables.ts` | **5–40** (add to SAFE_TABLE_VALUES) | **41–42**: SafeTableName and assertSafeTable depend on this list. |
| **New table types** | Row/Insert/Update for new table | `lib/supabase/types.ts` | Under `Database["public"]["Tables"]` (e.g. after existing governance tables) | Tables and Enums defined here; fromSafe requires table to exist in Types. |
| **Governance read API** | Expose governance_state to clients (if needed) | **New file** e.g. `app/api/governance/state/route.ts` | N/A (new route) | No existing route reads governance_state; state/current and behavioural-state do not reference it (state/current **43–45**, behavioural-state **33–35**). |
| **Cron entry point** | Already exists | `app/api/internal/governance/daily/route.ts` | **38** (profiles select), **runDailyGovernance** calls computeGovernanceState per user | **38**: fromSafe("profiles").select("id"); then for each userId, stateEngine.computeGovernanceState. |
| **Governance state computation** | Already exists | `lib/governance/stateEngine.ts` | **50–64** (read), **140** (upsert governance_state) | Reads behaviour_events, commitments, abstinence_targets, focus_sessions; writes governance_state only. |
| **Governance event recording** | Already exists | `lib/governance/events.ts` | **95** (insert behaviour_events) | recordEvent validates then fromSafe("behaviour_events").insert(row). |
| **Validation** | Already exists | `lib/governance/validation.ts` | **92–101** (BehaviourEventInsert), **142–149** (GovernanceStateUpdate) | All governance writes must call validateGovernancePayload; no change needed for existing tables. |

**Do not add:** Logic inside `lib/engine/behavioural/recomputeState.ts` (preserve single writer for behavioural_state_current). Do not add governance fields to `getState` or to GET /api/state/current or /api/behavioural-state response unless explicitly adding a new contract; the safest attachment is separate route + separate table.

---

## 6) Risk Register — Top 10 Risks (Evidence-Based)

| # | Risk | Mitigation | Evidence |
|---|------|------------|----------|
| 1 | **Second writer for behavioural_state_current** | Do not write to behavioural_state_current from governance code. Only recomputeState may upsert it. | recomputeState.ts **158**; stateEngine.ts **6**, **38** (explicit no-modify). |
| 2 | **recomputeState reading governance tables** | Keep recomputeState limited to current inputs (profiles, vella_settings, subscriptions, journal_entries, check_ins, conversation_messages, user_goals). If governance is needed for “state,” read governance_state in separate API, not inside recomputeState. | recomputeState.ts **74–110**, **129–139** (no governance tables). |
| 3 | **Existing routes assuming single state table** | No route joins or assumes a single state table; all use getState or direct read of behavioural_state_current with fallbacks. Adding governance_state does not require changing these. | Section 2.1: each route either single-table read or state + legacy/serverLocal fallback. |
| 4 | **Forgetting allowlist for new table** | Any new Supabase table must be added to SAFE_TABLE_VALUES; otherwise fromSafe(table) throws at runtime (assertSafeTable). | safeTables.ts **45–54**; admin.ts **37**, **56**. |
| 5 | **Types out of sync with DB** | Add new table to Database["public"]["Tables"] (and Enums) in types.ts; SafeTableName is Extract<SAFE_TABLE_VALUES, keyof Tables>, so table must be in both. | safeTables.ts **41**; types.ts structure. |
| 6 | **Governance write bypassing validation** | All governance writes (events, state) must call validateGovernancePayload before insert/upsert. Existing events.ts and stateEngine.ts already do. | events.ts **79**; stateEngine.ts **131**. |
| 7 | **Cron secret leakage** | Daily cron must remain protected by GOVERNANCE_DAILY_CRON_SECRET (or CRON_SECRET); no user content in request/response. | daily/route.ts: isAuthorized(request), runDailyGovernance returns only counts. |
| 8 | **serverLocal key collision** | Governance must not use serverLocal keys that exist (goals:, goal_actions:, progress_metrics:, achievements:, connection_depth:, etc.). Governance state is in Supabase only. | serverLocal usage Section 1.3; stateEngine writes only governance_state (Supabase). |
| 9 | **Memory/reindex or chunk reading governance** | memory/chunk and memory/reindex read journal_entries, conversation_messages, behavioural_state_history; they do not read governance_state. If future code adds governance to memory pipeline, ensure no PII (governance_state is metadata-only). | memory/chunk **48**, **55**, **70**; memory/reindex **54**, **65**, **85**; stateEngine state_json is codes/numbers only. |
| 10 | **Themes/traits/loops/distortions fallback coupling** | If governance were exposed via the same routes (e.g. themes), legacy getLifeThemes/getUserTraits etc. would need to be aware of governance or response shape would change. Keeping governance on a separate route avoids this. | themes/route **33–48** (state first, then legacy); no governance in response. |

---

## 7) “Do Not Touch” List (Preserve Current Behaviour)

| File / module | Reason (evidence) |
|---------------|-------------------|
| `lib/engine/behavioural/recomputeState.ts` | Single writer for behavioural_state_current and behavioural_state_history; any change to inputs or output shape affects all state readers and recompute callers (getState, state/recompute route). **158**, **171**. |
| `lib/engine/behavioural/getState.ts` | Sole provider of getBehaviouralStateForUser and tryRecomputeWithCooldown; used by progress, connection-depth, connection-index, themes, traits, loops, distortions, identity. **19**, **40**, **52**. |
| `app/api/state/current/route.ts` | Returns behavioural state only; contract is version, state_json, last_computed_at, updated_at. **43–55**. |
| `app/api/behavioural-state/route.ts` | Same; deprecated but still in use. **33–49**. |
| `app/api/state/history/route.ts` | Reads behavioural_state_history only; no governance. **44–54**. |
| `app/api/progress/route.ts` | Uses state.progress then getProgress fallback; must not be given governance responsibility. **25–31**. |
| `app/api/connection-depth/route.ts` | Uses state.connection_depth then loadConnectionDepth fallback; same. **25–31**. |
| `app/api/connection-index/route.ts` | Uses getState for connection index; do not add governance here. **25–28**. |
| `app/api/themes/route.ts` | State then legacy themes/traits/loops/distortions; do not add governance to this response. **27–48**. |
| `app/api/traits/route.ts` | Same pattern. **24–30**. |
| `app/api/loops/route.ts` | Same. **28–34**. |
| `app/api/distortions/route.ts` | Same. **28–34**. |
| `app/api/identity/route.ts` | Same. **30–33**. |
| `lib/connection/saveConnectionDepth.ts` | No-op; documents that connection_depth lives in behavioural_state_current. Do not convert to writing governance. **7–9**. |
| `lib/progress/saveProgress.ts` | No-op; documents progress in behavioural_state_current. Do not convert to writing governance. **9–15**. |
| `lib/goals/goalEngine.ts` | serverLocal only; no Supabase. Governance must not write goals or reuse goal keys. **37–44**, **51–82**. |
| `lib/progress/loadProgress.ts`, `lib/progress/updateProgress.ts`, `lib/progress/checkAchievements.ts`, `lib/progress/loadAchievements.ts` | serverLocal progress_metrics and achievements; do not mix with governance state. **21**, **25**, **30**, **33**, **73**. |
| `lib/connection/loadConnectionDepth.ts`, `lib/connection/depthEngine.ts` | serverLocal connection_depth read path and depth computation; do not add governance reads here. **8**, **166**. |
| `lib/supabase/client.ts` | assertSafeTable on client; changing allowlist semantics affects all client-side table access. **33–34**. |
| `lib/supabase/admin.ts` | wrapMetadataClient + fromSafe; same. **36–40**, **51–58**. |

**End of document. No code modified. All claims cite file paths and line numbers.**
