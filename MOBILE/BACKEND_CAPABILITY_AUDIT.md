# Full Forensic Backend Capability Audit — Vella MOBILE

**Scope:** Next.js 14 App Router, `app/api/**/route.ts` only. Read-only analysis; no modifications, no recommendations.

---

## STEP 1 — Enumerate All API Routes

**Scanned:** 59 route files under `MOBILE/app/api/`.

### Route table (summary)

| Route | Runtime | Auth? | rateLimit? | External | Writes DB? | Reads DB? | localStorage? | AI/OpenAI? | Deterministic vs LLM |
|-------|---------|-------|------------|----------|------------|-----------|---------------|------------|----------------------|
| `/api/account/delete` | (node) | Yes | Yes | Supabase | Yes | Yes | No | No | N/A |
| `/api/account/export` | (node) | Yes | Yes | Supabase | No | Yes | No | No | N/A |
| `/api/account/plan` | (node) | Yes | No | Supabase | No | Yes | No | No | N/A |
| `/api/architect` | (node) | Yes | Yes | OpenAI | No | No* | No | Yes (runLifeArchitect) | LLM |
| `/api/audio/vella` | nodejs | Yes | Yes | OpenAI | No | No | No | Yes (TTS) | Deterministic (TTS) |
| `/api/behaviour/rebuild` | (node) | Service key | No | — | No | No | Yes (client) | No | Deterministic |
| `/api/clarity` | (node) | Yes | Yes | OpenAI | No | No* | No | Yes (runClarityEngine) | LLM |
| `/api/cognitive-distortions` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/compass` | (node) | Yes | Yes | OpenAI | No | No* | No | Yes (runCompassMode) | LLM |
| `/api/conversation/reset` | (node) | No | Yes (IP) | — | No | No | No | No | N/A (no-op) |
| `/api/connection-depth` | (node) | Yes | Yes | — | No | No | Server file | No | Deterministic |
| `/api/connection-index` | (node) | Yes | Yes | — | No | No | Server file | No | Deterministic |
| `/api/deepdive` | (node) | Yes | Yes | OpenAI | No | No* | No | Yes (runDeepDive) | LLM |
| `/api/deep-insights` | (node) | Yes | Yes | — | No | No | No** | No | Deterministic (bundle null) |
| `/api/dev/token-dry-run` | (node) | No | Yes (IP) | — | No | No | No | No | N/A (dev only) |
| `/api/distortions` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/emotion-intel` | (node) | Yes | Yes | OpenAI | No | No* | No | Yes (runEmotionIntelBundle) | LLM |
| `/api/emotion-memory` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/feedback/create` | (node) | Yes | Yes | Supabase | Yes (feedback) | No | No | No | N/A |
| `/api/forecast` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/goals` | (node) | Yes | Yes | — | No | No | Server file | No | Deterministic |
| `/api/growth-roadmap` | (node) | Yes | Yes | — | No | No | Yes | No | Hybrid (lite + optional LLM) |
| `/api/identity` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/insights/generate` | (node) | Yes | Yes | OpenAI | No | No | Yes (loadLocal) | Yes (fallback lite) | Hybrid |
| `/api/insights/patterns` | (node) | Yes | Yes | OpenAI | No | No | Yes | Yes (fallback lite) | Hybrid |
| `/api/journal` | (node) | Yes | Yes | — | No | No | Yes (journalLocal) | No*** | Deterministic + LLM (enrichment) |
| `/api/journal-themes` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/life-themes` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/loops` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/memory/snapshot` | (node) | Service key | No | — | No | No | Yes (client) | No | Deterministic |
| `/api/micro-rag/rebuild` | (node) | Service key | No | — | No | No | Server file | No | Deterministic |
| `/api/nudge` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/pattern-insight` | (node) | No | Yes (IP) | — | No | No | No | No | Deterministic (i18n) |
| `/api/patterns` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/prediction` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/progress` | (node) | Yes | Yes | — | No | No | Server file | No | Deterministic |
| `/api/reflection` | (node) | Yes | Yes | OpenAI | No | No* | No | Yes (callVellaReflectionAPI) | LLM |
| `/api/regulation` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/regulation-strategies` | (node) | No | Yes (IP) | — | No | No | No | No | Deterministic (static list) |
| `/api/reports/create` | (node) | Yes | Yes | Supabase | Yes (user_reports) | No | No | No | N/A |
| `/api/roadmap` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/realtime/offer` | (node) | Yes | Yes | OpenAI | No | No | No | Yes (realtime WS) | LLM (realtime) |
| `/api/realtime/token` | (node) | Yes | Yes | OpenAI | No | No | No | Yes (sessions) | N/A |
| `/api/strengths-values` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/strategy` | (node) | Yes | Yes | OpenAI | No | No* | No | Yes (runStoicStrategist) | LLM |
| `/api/stripe/create-checkout-session` | nodejs | Yes | Yes | Stripe, Supabase | No | No | No | No | N/A |
| `/api/stripe/portal` | nodejs | Yes | Yes | Stripe, Supabase | No | Yes | No | No | N/A |
| `/api/stripe/token-pack` | nodejs | Yes | Yes | Stripe | No | No | No | No | N/A |
| `/api/stripe/webhook` | nodejs | No (sig) | Yes (IP) | Stripe, Supabase | Yes (subs, token_topups, webhook_events) | Yes | No | No | N/A |
| `/api/themes` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/traits` | (node) | Yes | Yes | — | No | No | Yes (traitsLocal) | No | Deterministic |
| `/api/transcribe` | nodejs | Yes | Yes | OpenAI | No | No | No | Yes (Whisper) | Deterministic (STT) |
| `/api/vella/text` | (node) | Yes | Yes | OpenAI | No | No* | No | Yes (runVellaTextCompletion or scripted) | Hybrid |
| `/api/voice/speak` | nodejs | Yes | Yes | OpenAI | No | No | No | Yes (TTS) | Deterministic (TTS) |
| `/api/voice/transcribe` | nodejs | No | Yes (IP) | — | No | No | No | No | N/A (410 legacy) |
| `/api/weekly-review` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/behaviour-loops` | (node) | Yes | Yes | — | No | No | Yes | No | Deterministic |
| `/api/social/rebuild` | (node) | Service key | No | — | No | No | Server file | No | Deterministic |
| `/api/sleep/rebuild` | (node) | Service key | No | — | No | No | Yes (client) | No | Deterministic |

\* Reads via lib that may use serverLocal (persona/profile) or memory/conversation (local); no Supabase for content.  
\*\* `loadLatestDeepInsights` and `saveDeepInsights` are deprecated no-ops; GET returns null, POST generates but does not persist.  
\*** Journal enrichment (summarize, tags, themes, loops, distortions, etc.) can use LLM when AI not disabled; persistence is local only.

**Notes:**

- **Runtime:** Only routes that set `export const runtime = "nodejs"` are explicitly node; others use Next default (node).
- **Auth:** “Service key” = `enforceServiceKeyProtection` + Bearer `SUPABASE_SERVICE_ROLE_KEY` (memory/snapshot, micro-rag/rebuild, behaviour/rebuild, social/rebuild, sleep/rebuild).
- **DB:** “Writes DB” / “Reads DB” = Supabase only. Server file (`.vella/`) and client localStorage are not DB.
- **localStorage:** “Yes” = code path uses lib that reads/writes `localStorage` (e.g. journalLocal, conversationLocal, traitsLocal, memory snapshots). On server those calls no-op or return empty when `typeof window === 'undefined'`.
- **AI call:** “Yes” = route or its direct lib calls OpenAI (chat, TTS, Whisper, realtime) or internal `runFullAI`/agents.

**Lib imports (by domain):**

- **Auth:** `@/lib/supabase/server-auth` (requireUserId), `@/lib/supabase/admin`, `@/lib/security/serviceKeyProtection`
- **Rate limit:** `@/lib/security/rateLimit`, `@/lib/security/rateLimit/config`
- **Stripe:** `@/lib/payments/stripe`, `@/lib/payments/originValidation`, `@/lib/payments/webhookIdempotency`
- **OpenAI / AI:** `@/lib/ai/client`, `@/lib/ai/reflection`, `@/lib/ai/agents`, `@/lib/ai/circuitBreaker`, `@/lib/ai/textEngine`, `@/lib/ai/textPrompts`, `@/lib/security/fetchWithTimeout`
- **Tokens / billing:** `@/lib/tokens/enforceTokenLimits`, `@/lib/tiers/server`, `@/lib/tiers/planUtils`, `@/lib/tiers/tierCheck`
- **Insights / patterns / themes / loops / distortions / traits / forecast / regulation / goals:** `@/lib/insights/*`, `@/lib/patterns/*`, `@/lib/themes/*`, `@/lib/loops/*`, `@/lib/distortions/*`, `@/lib/traits/*`, `@/lib/forecast/*`, `@/lib/regulation/*`, `@/lib/goals/goalEngine`
- **Journal:** `@/lib/journal/server`, `@/lib/journal/summarizeJournal`, `@/lib/journal/extractEmotionTags`, etc.; server delegates to `@/lib/local/journalLocal` (localStorage).
- **Memory / conversation:** `@/lib/memory/*`, `@/lib/local/conversationLocal`, `@/lib/local/memorySnapshotsLocal`, `@/lib/local/serverLocal`, `@/lib/connection/*`, `@/lib/progress/*`
- **Realtime / voice:** `@/lib/realtime/vellaRealtimeConfig`, `@/lib/telemetry/voiceTelemetry`
- **Storage:** Supabase via `fromSafe("...")`; server-side JSON in `.vella/` via `serverLocalGet`/`serverLocalSet`; client via `loadLocal`/`saveLocal` (localStorage).

---

## STEP 2 — Domain Categorisation

Grouping by what the code does (no assumptions).

### Account / Auth

- **Routes:** account/plan, account/export, account/delete.
- **Input:** Authenticated session (cookies).
- **Processing:** plan: read subscriptions via tiers/server (Supabase). export: read profiles, subscriptions, vella_settings, user_preferences, token_usage, token_topups. delete: delete same tables + auth.admin.deleteUser.
- **Output:** plan JSON; export JSON file; delete confirmation.
- **Deterministic.** Relies on Supabase. **Stateful** (reads/writes backend state).

### Stripe / Billing

- **Routes:** stripe/create-checkout-session, stripe/portal, stripe/token-pack, stripe/webhook.
- **Input:** Session (checkout/portal/token-pack); raw body + signature (webhook).
- **Processing:** Create Stripe session; redirect to portal; create token-pack session; verify signature, idempotency (webhook_events), upsert subscriptions, handle payment_intent.succeeded → token_topups + subscriptions.token_balance.
- **Output:** URLs or 200; webhook 200.
- **Deterministic.** External: Stripe. DB: subscriptions, token_topups, webhook_events. **Stateful.**

### Journal

- **Routes:** journal (GET/POST/PUT/PATCH).
- **Input:** GET: none; POST/PUT/PATCH: body (content, title, id, etc.).
- **Processing:** listJournalEntries/createJournalEntry/updateJournalEntry (lib/journal/server → journalLocal). Enrichment (summarize, emotion tags, themes, loops, distortions, traits, follow-ups, micro-insights) when AI not disabled; updateLastActive, updateProgress, updateConnectionDepth.
- **Output:** List of entries or single entry; enrichment is in-memory/returned, not stored in Supabase. Persistence is **client localStorage** (journalLocal); on server, listLocalJournals has no window → empty list.
- **Hybrid:** Enrichment can be LLM; storage path is local. **Stateful** on client; server sees no journal content persistence.

### Memory / Snapshot

- **Routes:** memory/snapshot.
- **Input:** POST body `{ userId }`, service key.
- **Processing:** buildMemorySnapshot(userId) (journals, checkins, patterns, themes, loops, distortions, traits, goals, style from local/server sources); saveSnapshot → saveLocalMemorySnapshot (client localStorage). On server, journals/checkins from local are empty if no window.
- **Output:** `{ success: true }`.
- **Deterministic** aggregation. **Uses localStorage** (client); server snapshot of “memory” is empty unless invoked in context where local data is available.

### Insights / Pattern Analysis

- **Routes:** insights/generate, insights/patterns, deep-insights.
- **Input:** insights/generate: body (checkins, locale, etc.); insights/patterns: body (checkins, etc.); deep-insights: none (GET) or trigger (POST).
- **Processing:** generate: buildInsightPrompt, optional OpenAI completion, else buildLiteInsights; patterns: OpenAI or computeLitePatterns; deep-insights: generateDeepInsights then saveDeepInsights (no-op), loadLatestDeepInsights returns null.
- **Output:** Insight cards; pattern buckets; deep-insights bundle (null in practice).
- **Hybrid** (generate, patterns); **deterministic** (deep-insights is no-op persist). Uses checkins/journals from **local** (getAllCheckIns, loadLocal). **Stateless** per request (no server DB for insight content).

### Behaviour Loops / Cognitive Distortions / Themes

- **Routes:** behaviour-loops, loops, cognitive-distortions, distortions, journal-themes, life-themes, themes, regulation, regulation-strategies, strengths-values.
- **Input:** Auth; some accept body (e.g. regulation-strategies is static).
- **Processing:** getBehaviourLoops, getCognitiveDistortions, getLifeThemes, extractStrengthsAndValues, generateRegulationStrategies, etc. All pull from local/journal/checkins/patterns/traits/goals (local or server file). regulation-strategies returns a fixed array.
- **Output:** Arrays of loops, distortions, themes, strategies, strengths/values.
- **Deterministic** (rule/heuristic). **Relies on prior stored data** in local/server file. **Stateless** API (no Supabase for this content).

### Growth Roadmap / Forecast / Prediction / Roadmap

- **Routes:** growth-roadmap, forecast, prediction, roadmap.
- **Input:** Auth; request body where applicable.
- **Processing:** buildGrowthRoadmapDetailed; generateEmotionalForecast; prediction logic; roadmap aggregates traits, themes, loops, distortions, goals, forecast, weekly signals, persona. growth-roadmap can use LLM (buildGrowthRoadmapDetailed) or lite.
- **Output:** Roadmap payload; short-term forecast; prediction result; roadmap JSON.
- **Hybrid** (growth-roadmap); rest **deterministic**. Data from local/server file. **Stateless.**

### Identity / Traits / Progress / Connection

- **Routes:** identity, traits, progress, connection-depth, connection-index.
- **Input:** Auth.
- **Processing:** identity: traits, strengthsValues, themes, loops, distortions, goals (all from local/server). traits: getUserTraits/upsertUserTraits (traitsLocal + serverLocal). progress: getProgress/updateProgress (serverLocal). connection-depth: loadConnectionDepth/updateConnectionDepth (serverLocal). connection-index: derived from progress/connection.
- **Output:** JSON for identity, traits, progress, depth, index.
- **Deterministic.** **Stateful** in server file (`.vella/`) and client (traits). **No Supabase** for these domains.

### Realtime / Voice / Audio

- **Routes:** realtime/token, realtime/offer, voice/speak, voice/transcribe, transcribe, audio/vella.
- **Input:** Auth (except voice/transcribe); body (text for TTS, audio for STT, realtime params).
- **Processing:** realtime: OpenAI sessions or WebSocket URL; speak: OpenAI TTS; transcribe: Whisper; audio/vella: preset-based TTS. voice/transcribe returns 410 (legacy disabled).
- **Output:** Session credentials, WebSocket URL, audio buffer, or transcript.
- **OpenAI** (TTS, STT, realtime). **Deterministic** for TTS/STT; **LLM** for realtime. **Stateless** (no DB for audio).

### Vella Text / Reflection / Clarity / Strategy / Architect / Deepdive / Emotion-intel / Compass

- **Routes:** vella/text, reflection, clarity, strategy, architect, deepdive, emotion-intel, compass.
- **Input:** Message or structured payload (e.g. clarity sections, type for reflection).
- **Processing:** vella/text: exercise intent detection (scripted) or runVellaTextCompletion (OpenAI); reflection: callVellaReflectionAPI (getRecentMessages, getSummary, buildMemoryContext, runFullAI); clarity/strategy/architect/deepdive/emotion-intel/compass: runClarityEngine, runStoicStrategist, runLifeArchitect, runDeepDive, runEmotionIntelBundle, runCompassMode (all use OpenAI + context from memory/conversation/persona).
- **Output:** Text or structured result.
- **LLM-based.** Context from **conversation/memory** (local only) and **persona** (serverLocal). **Stateless** at API layer (no Supabase for dialogue).

### Goals

- **Routes:** goals (GET/POST/PATCH).
- **Input:** Auth; body for POST/PATCH (type, title, etc.).
- **Processing:** listGoals, createGoal, updateGoalStatus (lib/goals/goalEngine → serverLocalGet/serverLocalSet).
- **Output:** goals array or single goal.
- **Deterministic.** **Stateful** in server file. **No Supabase.**

### Dev / Debug

- **Routes:** dev/token-dry-run, conversation/reset.
- **Input:** None or IP.
- **Processing:** token-dry-run: getDryRunEvents (in-memory), 403 in production. conversation/reset: returns fixed message “reset_disabled_local_memory_only”.
- **Output:** Dry-run events or message. **Deterministic.** No DB.

### Feedback / Reports

- **Routes:** feedback/create, reports/create.
- **Input:** Body (rating, category, etc.; or report fields).
- **Processing:** fromSafe("feedback").insert; fromSafe("user_reports").insert.
- **Output:** success/error.
- **Deterministic.** **Writes DB.** **Stateful.**

### Micro-RAG / Behaviour Rebuild / Social / Sleep Rebuild

- **Routes:** micro-rag/rebuild, behaviour/rebuild, social/rebuild, sleep/rebuild.
- **Input:** Service key + body `{ userId }`.
- **Processing:** buildMicroRagCache/saveCache (serverLocal); buildBehaviourMap/saveBehaviourMap (writeLocalJSON → client); social/sleep rebuild (similar pattern).
- **Output:** `{ success: true }`.
- **Deterministic.** Cache/behaviour stored in **server file** or **client localStorage**. No Supabase.

### Nudge / Weekly Review / Pattern Insight

- **Routes:** nudge, weekly-review, pattern-insight.
- **Input:** Auth (nudge, weekly-review) or IP (pattern-insight); body for pattern-insight (patterns, language).
- **Processing:** Nudge/weekly-review: logic from local/server data; pattern-insight: i18n interpolation of pattern buckets.
- **Output:** Nudge state, weekly review payload, or interpolated strings.
- **Deterministic.** **Stateless** (no Supabase).

---

## STEP 3 — Data Model Mapping

### Supabase tables (from code and `lib/supabase/types.ts`)

| Table | Purpose | Critical to product? | Used by which routes / libs |
|-------|---------|----------------------|-----------------------------|
| profiles | User profile (display_name, avatar_url, app_language) | Yes (auth/export/delete) | account/export, account/delete; personaServer reads from serverLocal, not this |
| vella_settings | Voice, tone, relationship_mode, voice_hud, language, privacy | Yes (export/delete) | account/export, account/delete |
| subscriptions | plan, stripe_customer_id, stripe_subscription_id, token_balance, period | Yes (billing, plan, tokens) | stripe/portal, stripe/webhook, account/plan, account/export, account/delete, tiers/server |
| token_usage | Per-request token consumption | Yes (quotas) | enforceTokenLimits → usageServer; account/export, account/delete |
| token_topups | Purchased token packs | Yes (billing) | stripe/webhook; account/export, account/delete |
| user_preferences | notifications_enabled, daily_checkin, journaling_prompts | Yes (export/delete) | account/export, account/delete |
| webhook_events | Stripe event idempotency | Yes (webhook safety) | stripe/webhook, webhookIdempotency |
| feedback | User ratings (1–10), channel, category | No (analytics) | feedback/create |
| user_reports | Reported issues, severity, status | No (support) | reports/create |

**Tables in `types.ts` not written by current API (legacy or unused):**  
checkins, goals, user_traits, user_traits_history, user_nudges, user_goals, user_goal_actions, progress_metrics, connection_depth, last_active, social_models, vella_personality, micro_rag_cache, achievements, token_rates.

**Server-side storage (not Supabase):**

- **.vella/ (serverLocal):** goals, goal_actions, progress_metrics, connection_depth, micro_rag_cache, vella_settings:${userId}, profiles:${userId}. Used by goals, progress, connection-depth, micro-rag/rebuild, loadServerPersonaSettings.

**Client-only (localStorage):**

- Journals (journalLocal), conversation (conversationLocal), traits (traitsLocal), memory snapshots (memorySnapshotsLocal), checkins (checkinsLocal), behaviour map (saveBehaviourMap → writeLocalJSON). API routes that “read” this data run on server and get empty/fallback when `window` is undefined unless data is passed in request.

---

## STEP 4 — Intelligence Architecture Mapping

- **Where OpenAI is called:**  
  - **Chat/completion:** reflection (runFullAI), vella/text (runVellaTextCompletion), clarity, strategy, architect, deepdive, emotion-intel, compass (agents); insights/generate, insights/patterns (with lite fallback).  
  - **Embeddings:** Not used in the scanned route handlers; lib/ai/embeddings exists but no route in app/api calls it in the scanned files.  
  - **Long-form:** runFullAI, runDeepDive, runLifeArchitect, runStoicStrategist, etc.  
  - **TTS/STT:** voice/speak, transcribe, audio/vella (OpenAI speech); realtime/offer, realtime/token (OpenAI realtime).

- **Deterministic rule engines:**  
  - Regulation strategies (static list); pattern-insight (i18n); growth roadmap lite; insight/pattern lite fallbacks; exercise scripts in vella/text; progress, connection depth, traits (formulas from checkins/journals).

- **Memory reconstruction:**  
  - getRecentMessages, getSummary (conversationLocal); buildMemoryContext (string from those). No server-side conversation DB. Memory is **client-local**; server sees it only when passed or when logic runs in a context with local state.

- **Multi-step orchestration:**  
  - reflection: persona + memory context + runFullAI + updateConnectionDepth. Agents (clarity, strategy, architect, etc.): context building + single completion. No explicit DAG or multi-step pipeline in routes.

- **Policy / gating:**  
  - isAIDisabled (killSwitch); getUpgradeBlock / resolvePlanTier (tier checks); checkTokenAvailability / chargeTokensForOperation (token quota); rate limits; requireUserId.

**Classification:** **Hybrid.**  
- **Memory-augmented** only in the sense that reflection and agents consume “memory” and “summary” that are built from **local** conversation and context; there is **no** server-side durable memory store for dialogue.  
- **Deterministic behavioural engine** for progress, connection, traits, regulation, themes, loops, distortions (formulas + local data).  
- **Stateless chatbot** at the HTTP layer: each request gets context from local/server file and returns one response; no persistent conversation in DB.  
- So: **Hybrid of stateless request/response LLM plus local-memory context and deterministic behavioural scores**, with **no server-side memory store** for conversation or journal content.

---

## STEP 5 — Capability Gaps

- **Actually capable today:**  
  - Auth and plan from Supabase; Stripe checkout/portal/webhooks and token top-ups; token quota enforcement; feedback and reports to DB.  
  - Text chat (vella/text) and reflection with persona and **client-supplied** memory context; clarity, strategy, architect, deepdive, emotion-intel, compass (LLM).  
  - TTS (speak, audio/vella), STT (transcribe); realtime session/token and offer.  
  - Journal CRUD and enrichment **against local storage** (on server, journal list is empty unless invoked in context with local data).  
  - Goals, progress, connection depth, traits, themes, loops, distortions, regulation, forecast, roadmap, identity, insights (lite or LLM) **from local/server file data**; growth-roadmap and insights/generate can call OpenAI.  
  - Memory snapshot and micro-rag/behaviour rebuild (service-key only) writing to **local** or server file.

- **UI may imply, backend does not support:**  
  - **Server-persisted journal or check-ins:** All journal and check-in persistence is client localStorage (and server returns empty list when run on server).  
  - **Server-persisted conversation history:** Conversation is local only; “memory” in API is built from that local data when available.  
  - **Deep insights persistence:** saveDeepInsights/loadLatestDeepInsights are no-ops; GET deep-insights returns null.  
  - **Cross-device sync** of journal, check-ins, goals, traits, conversation: not implemented (local/server file only).

- **Scaffolding:**  
  - conversation/reset returns a message only (no actual reset).  
  - voice/transcribe returns 410 (legacy disabled).  
  - Deep-insights save/load deprecated.  
  - Many “read” routes return empty or fallback when run on server because they depend on localStorage.

- **Production-grade:**  
  - Stripe webhook (idempotency, subscriptions, token_topups).  
  - Auth (requireUserId), rate limiting, token checks, kill switch.  
  - Account export/delete against Supabase.  
  - Feedback and reports to Supabase.

- **Experimental / best-effort:**  
  - All insight/themes/loops/distortions/traits/forecast/roadmap logic that depends on journal/check-in data: when API runs on server without client data, results are empty or default.  
  - Memory snapshot and rebuild endpoints: depend on service key and local/server state.

---

## STEP 6 — Competitive Reality Check

- **Category:** Therapeutic/wellness companion with text and voice, CBT-style patterns (distortions, loops), journaling, and billing. Not a full EMR or licensed therapy product.

- **Technical sophistication tier:** **Mid.**  
  - **Mid:** Structured prompts, persona, token gating, rate limits, Stripe and Supabase wired; multiple “modes” (reflection, clarity, strategy, architect, etc.); TTS/STT and realtime API.  
  - **Not high:** No server-side memory store, no embeddings in routes, no RAG over user data in API, no multi-step orchestration; conversation and journal are client-local; deep-insights persistence removed.

- **Scalability constraints:**  
  - Per-user state (goals, progress, connection, traits, persona) in server file (`.vella/`) does not scale across instances unless shared storage.  
  - Token and subscription state in Supabase scale with DB.  
  - Realtime and TTS/STT scale with OpenAI and connection handling.

- **Strong:**  
  - Billing and subscription and token accounting; auth and safety (rate limit, kill switch, validation).  
  - Variety of LLM entry points (reflection, clarity, strategy, architect, etc.) with tier/token gating.  
  - Voice pipeline (TTS, STT, realtime) and deterministic behavioural/insight layer (themes, loops, distortions, regulation).

- **Weak:**  
  - No durable server-side memory or journal; no cross-device sync; deep-insights not persisted; many features depend on client-local or single-server file state.

---

## Final Deliverables

### 1. Backend Capability Map

- **59 API routes** under `app/api/`.  
- **Auth:** Most routes use `requireUserId`; stripe/webhook uses signature; memory/snapshot, micro-rag/rebuild, behaviour/rebuild, social/rebuild, sleep/rebuild use service key.  
- **External:** Supabase (profiles, subscriptions, token_usage, token_topups, webhook_events, feedback, user_reports); Stripe (checkout, portal, token-pack, webhooks); OpenAI (chat, TTS, Whisper, realtime).  
- **Persistence:** Supabase for account/billing/tokens/feedback/reports; server file (`.vella/`) for goals, progress, connection, cache, persona; client localStorage for journal, check-ins, conversation, traits, snapshots, behaviour map.  
- **AI:** LLM in reflection, vella/text, clarity, strategy, architect, deepdive, emotion-intel, compass, insights/generate, insights/patterns; TTS/STT and realtime; lite/scripted fallbacks where implemented.

### 2. Intelligence Architecture Classification

- **Hybrid:** Stateless request/response LLM with **local-memory context** (conversation + summary from client), plus **deterministic behavioural engine** (progress, connection, traits, themes, loops, distortions, regulation).  
- **No** server-side memory store for conversation or journal.  
- **No** embeddings or RAG in the enumerated API routes.  
- Single-step completion per route; policy and tier/token gating in place.

### 3. Storage Model Summary

- **Supabase (critical):** profiles, vella_settings, subscriptions, token_usage, token_topups, user_preferences, webhook_events.  
- **Supabase (non-critical):** feedback, user_reports.  
- **Server file (`.vella/`):** goals, progress, connection_depth, micro_rag cache, persona/profile cache.  
- **Client localStorage:** journal, check-ins, conversation, traits, memory snapshots, behaviour map.  
- **Schema-only (not used by current API writes):** checkins, goals, user_traits, progress_metrics, connection_depth, last_active, etc. in types.

### 4. Real Capability Summary (3–5 bullets)

- **Billing and identity:** Stripe checkout/portal/token-pack and webhooks; subscription and token balance in Supabase; account plan, export, delete; feedback and reports to DB.  
- **Conversation and reflection:** Text chat and reflection with persona and **client-local** conversation/summary; no server-side conversation store; multiple LLM “modes” (clarity, strategy, architect, deepdive, emotion-intel, compass) with tier/token gating.  
- **Voice:** TTS (speak, audio/vella), STT (transcribe), realtime session/offer; voice/transcribe disabled (410).  
- **Insights and behaviour:** Themes, loops, distortions, regulation, traits, forecast, roadmap, identity, insights (lite or LLM) computed from **local/server file** data; deep-insights not persisted.  
- **Journal and goals:** Journal CRUD and enrichment backed by **client localStorage**; goals and progress in **server file**; no Supabase persistence for journal or check-ins.

### 5. Brutal Reality Assessment

- **Server does not store** journal entries, check-ins, or conversation history; all of that is client-local (or server file for goals/progress/connection). Any “memory” or “insight” that depends on journal/check-ins is **empty or default when the API runs on the server** without that data.  
- **Deep-insights** are generated on POST but **never persisted** (save/load are no-ops); GET returns null.  
- **Realtime and voice** are wired to OpenAI and work for a single device/session; **cross-device and server-backed memory** are not in the backend.  
- **Product surface** (many routes and “modes”) is **wider than the durable backend**: billing and auth are solid; the rest is either local/server-file state or stateless LLM with local context.  
- **Scalability** of user state is limited by `.vella/` file storage and by the lack of a shared conversation/memory store.

---

*End of audit. No fixes, roadmap, or UI changes proposed.*
