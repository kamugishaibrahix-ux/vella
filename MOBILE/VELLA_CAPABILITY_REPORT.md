# Vella Capability Report

Strict read-only technical report. Implementation facts from code only. No opinion, no redesign, no marketing language.

---

## 1. Persona & Mode System

### Relationship modes

**Defined:** `lib/ai/persona/personaConfig.ts` — `RELATIONSHIP_MODES`  
Keys: `best_friend`, `mentor`, `big_sister`, `little_sister`, `partner_soft`, `partner_playful`, `other`.  
Each has: `descriptor` (string), `behaviour` (array of strings), `emotionalBaseline` (valence, warmth, curiosity, tension, optional arousal).

**Injected:**  
- `lib/ai/personaServer.ts`: `loadServerPersonaSettings` returns `relationshipMode: "best_friend"` **hardcoded** (line 45). Profile/settings are not read for relationship; only voice, tone, toneStyle, language are taken from settings/profile.  
- `lib/realtime/personaSynth.ts`: `buildPersonaInstruction` uses `userSettings?.relationshipMode ?? relationshipMode ?? "best_friend"` and looks up `RELATIONSHIP_MODES[resolvedRelationshipMode]` to build the relationship line in the persona prompt (`You are speaking as ${relationship.descriptor}. Your behavioural style includes: ...`).  
- `lib/ai/agents.ts`: `loadServerVellaSettings` returns `persona.relationshipMode` (from personaServer, so always `"best_friend"`); that is passed into `buildPersonaInstruction` for the conversational guide.  
- **Conclusion:** Relationship mode is **tone/phrasing only**. It changes the system prompt (descriptor + behaviour list). No separate code paths or capability gates by relationship. Server-side default is always `best_friend`; client/settings could override only if passed into personaSynth/agents.

### Tone modes (ToneProfileKey)

**Defined:** `lib/ai/persona/toneProfiles.ts` — `TONE_PROFILES`: `soft`, `warm`, `direct`, `stoic`, `playful`.  
Each: `cadence`, `directness`, `warmth`, `playfulness` (numbers).

**Injected:**  
- Used in persona blending and tone resolution in `lib/ai/intent/toneProfiles.ts` and agent flow.  
- `resolveToneProfile(intent)` and `getToneProfileForPreference(resolvedTonePreference)` drive which tone is used.  
- **Conclusion:** Tone changes **phrasing/warmth/directness** in prompts and blending; no separate logic or capabilities by tone.

### VellaPersonaMode (keyword-based)

**Defined:** `lib/ai/agents.ts` — `VellaPersonaMode = "soft_calm" | "warm_playful" | "stoic_coach"`.  
`choosePersonaMode(params)` uses keyword matching on `recentMessage`, `mood`, `patternsSummary`:  
- SOFT_KEYWORDS → `soft_calm`  
- PLAYFUL_KEYWORDS → `warm_playful`  
- STOIC_KEYWORDS / "stuck", "uncertain", "decision" → `stoic_coach`  
- Default: `stoic_coach`.

**Injected:**  
- Used to choose persona for `generateLiteResponse` (lite fallback) and for `mapAbsenceTone` (absence/presence message).  
- **Conclusion:** **Tone only** (which lite/absence message style); no capability or logic switch.

### ConversationMode (conversation directives)

**Defined:** `lib/ai/agents.ts` — `ConversationMode`: `default`, `deep_reflection`, `execution_coach`, `stoic_mentor`, `clarity_mode`, `behaviour_analysis`, `mindset_reset`, `voice`, `audio`.  
`buildModeSystemPrompt(mode, basePrompt, context)` appends a single **mode directive** string to the system prompt (e.g. "You are in stoic mentor mode: lean on Stoic principles...").

**Injected:**  
- `runConversationalGuide` accepts `mode` (default `"default"`). The mode is mapped to a feature key for tier gating (`getUpgradeBlock(planTier, modeFeatureKey)`).  
- `mode_deep_reflection`, `mode_execution_coach`, `mode_stoic_mentor`, etc. are gated to pro/elite in `lib/tiers/tierCheck.ts`.  
- **Call site:** `runConversationalGuide` is **not** invoked by `app/api/vella/text/route.ts`. The text route uses `buildVellaTextPrompt` + `runVellaTextCompletion` (textEngine) only. No conversation route in `app/api` calls `runConversationalGuide`. So **ConversationMode is not applied on the main text chat path**; it only affects any flow that calls `runConversationalGuide` (e.g. realtime/audio if wired there).

### Persona & mode summary table

| Mode / concept | Defined where | Injected where | Changes logic? | Changes tone only? | User visible? |
|----------------|---------------|----------------|----------------|--------------------|--------------|
| RELATIONSHIP_MODES (best_friend, mentor, etc.) | personaConfig.ts | personaSynth.buildPersonaInstruction, agents (via loadServerVellaSettings) | No | Yes (descriptor + behaviour in prompt) | Only if UI sends relationshipMode; server default best_friend |
| TONE_PROFILES (soft, warm, direct, stoic, playful) | persona/toneProfiles.ts | intent/toneProfiles, blending, agents | No | Yes | Yes (settings) |
| VellaPersonaMode (soft_calm, warm_playful, stoic_coach) | agents.ts choosePersonaMode | lite fallback, absence message | No | Yes | Indirect (response style) |
| ConversationMode (default, deep_reflection, stoic_mentor, etc.) | agents.ts buildModeSystemPrompt | runConversationalGuide only | No (prompt directive only) | Yes | Gated by tier; not used by /api/vella/text |

---

## 2. Behavioural Intelligence Layer

### Engine: `lib/engine/behavioural/`

- **recomputeState.ts:** Reads only from Supabase: `profiles`, `vella_settings`, `subscriptions`, `journal_entries`, `check_ins`, `conversation_messages`, `user_goals`. **Deterministic:** counts (journal, checkin, message, goals), `connection_depth = min(10, floor(messageCount/5))`, `progress.{journal_count, checkin_count, message_count, goals_count}`, `metadata.{window_start, window_end, sources}`. **Does not compute** traits, themes, loops, distortions; schema has those keys but they are left empty (EMPTY_STATE).  
- **getState.ts:** Reads `behavioural_state_current`; optionally calls `tryRecomputeWithCooldown` then reads again.

**Conclusion:** The behavioural **state** table is filled with **deterministic counts and connection_depth only**. Traits, themes, loops, distortions in that state are never written by recomputeState; they remain empty.

### Traits: `lib/traits/adaptiveTraits.ts`

- **collectTraitSignals:** Fetches check-ins, journals (local), `detectBehaviourLoops`, `detectCognitiveDistortions`, `generateEmotionalPatterns`. Aggregates: avgMood, moodVolatility, avgStress, avgFocus, checkinCount, journalCount, loopCount, distortionCount, patternCount.  
- **computeTraitScores(signals):** **Deterministic formula** producing six scores (0–100): resilience, clarity, discipline, emotional_stability, motivation, self_compassion. Uses mood, stress, focus, volatility, density, journalSignal, patternSignal, loopCount, distortionCount.  
- **getUserTraits:** Returns cached local traits or calls `upsertUserTraits` (which uses the deterministic formula).  
- **Used in prompts:** `agents.ts` `buildTraitHints(traits)` turns trait scores into short directive lines (e.g. "Resilience feels strained; stay extra grounding") and appends them to the mode system prompt in `runConversationalGuide`. Not used by `/api/vella/text`.

### Connection: `lib/connection/depthEngine.ts`

- **updateConnectionDepth:** Deterministic: combines message count, journaling depth, progress consistency/openness, then increases a stored depth score (capped).  
- **getConnectionDashboard:** Deterministic: score, history, streaks, milestones (bands 0–100 with titles like "First Spark", "Warming Up", …), patterns, insights, suggestions, shortEmotionalLine. All from check-ins, journals, progress, message count.  
- **Exposed:** `GET /api/connection-index` returns dashboard (or simplified view from behavioural_state when state exists). Connection depth is passed to realtime/audio context and can be used in prompts (e.g. absence message).

### Loops and distortions (insights)

- **lib/insights/behaviourLoops.ts:** Free tier: `heuristicLoops(checkins)` (deterministic). Paid: `callVellaReflectionAPI({ type: "behaviour_loops", data: { checkins, journals, patterns, journalThemes } })` → **LLM**.  
- **lib/insights/cognitiveDistortions.ts:** Free tier: `heuristicDistortions(journals, conversation)` (deterministic). Paid: `callVellaReflectionAPI({ type: "cognitive_distortions", data: { journals, conversation, patterns, behaviourLoops } })` → **LLM**.  
- **lib/themes/getLifeThemes.ts**, **lib/loops/getBehaviourLoops.ts**, **lib/distortions/getCognitiveDistortions.ts:** Used by `/api/themes` when behavioural state is missing or state.themes/loops/distortions are empty; they call the above LLM/heuristic implementations.

### Behavioural state vs legacy APIs

- **GET /api/behavioural-state** (and **GET /api/state/current**): Return `state_json` from `behavioural_state_current`. That state contains only progress counts, connection_depth, metadata; traits/themes/loops/distortions in state are always empty.  
- **GET /api/themes:** If `state.state` exists, returns `state.themes`, `state.loops`, `state.distortions`, `state.traits` (hence empty arrays/objects from recompute). Otherwise falls back to getLifeThemes, getBehaviourLoops, getCognitiveDistortions, getUserTraits (LLM or deterministic).  
- **GET /api/traits:** If `state.state.traits` is an object, returns it (empty from recompute); else `getUserTraits` (deterministic formula).  
- **GET /api/connection-depth, /api/connection-index:** Read `state.connection_depth` when state exists; else use connection dashboard (deterministic) or legacy progress.

### Behavioural intelligence summary table

| Feature | Deterministic | LLM | Exposed to user? | Used in prompt? |
|---------|---------------|-----|------------------|-----------------|
| behavioural_state_current (progress, connection_depth, metadata) | Yes (recomputeState) | No | Yes via /api/state/current, /api/behavioural-state, /api/connection-depth, /api/connection-index, /api/themes, /api/traits, /api/loops, /api/distortions | connection_depth/context in runConversationalGuide / realtime |
| behavioural_state traits/themes/loops/distortions | N/A (never written) | N/A | Returned as empty when state used first; else legacy LLM/heuristic | No |
| Trait scores (resilience, clarity, …) | Yes (adaptiveTraits formula) | No | Yes via /api/traits, /api/themes | Yes in runConversationalGuide (buildTraitHints) |
| Connection dashboard (score, milestones, patterns, insights) | Yes | No | Yes via /api/connection-index | Indirect (absence, depth) |
| Behaviour loops (paid) | No | Yes (reflection API) | Yes via /api/loops, /api/themes, insights UI | No |
| Cognitive distortions (paid) | No | Yes (reflection API) | Yes via /api/distortions, /api/themes, insights UI | No |
| Life themes / strengths-values | Mixed (getLifeThemes, identity) | Yes where used | Yes via /api/themes, themes/life-themes UI | No |

**Direct answer:** `behavioural_state_current.state_json` is **not** shown raw in the UI. Its fields are returned by the APIs above; themes/loops/distortions from state are empty; the UI shows legacy themes/loops/distortions from separate LLM/heuristic calls when state is used first.

---

## 3. Memory & Retrieval System

### Retrieval: `lib/memory/retrieve.ts`

- **retrieveTopK(opts):**  
  - **Paid + embeddings allowed:** Embeds `queryText`, loads recent embedded chunks, scores by cosine similarity (0.85) + recency (0.15), returns top-k blocks (excerpts).  
  - **Free or embeddings disabled:** Uses `getRecentChunks` only; returns top-k by recency with a fixed score (0.5). No embeddings required for this path.  
- **formatMemoryContext(blocks, includeExcerpts):** Formats blocks as a bullet list for LLM context. Paid: `includeExcerpts === true` (excerpts included). Free: excerpts can be omitted (caller passes `paid`).

### Embeddings

- **lib/memory/embed.ts:** Uses OpenAI embeddings (or admin-configured model). Used by retrieval when tier is pro/elite and kill switch allows.  
- **Free plan:** No embedding call; retrieval uses recency-only. **Embeddings are not required for functionality;** free path still returns recent chunks.

### Where memory is used

- **app/api/vella/text/route.ts:** Calls `retrieveTopK` then `formatMemoryContext(memoryBlocks, paid)`. Injects memory section into `buildVellaTextPrompt` (textPrompts.ts). Memory context is **always** passed when blocks exist; for free users blocks are recency-only and excerpts may be omitted.  
- **lib/ai/reflection.ts:** For `callVellaReflectionAPI`, builds `memoryContext` from recent messages + thread summary + patternsSummary; then calls `retrieveTopK` and appends `formatMemoryContext(memoryBlocks, paid)` to the system prompt. So reflection uses both short-term context and retrieved long-term memory (when available).

### Context impact

- Memory is injected as text into the system or user prompt. **Model behaviour is changed only by the content of that text** (no separate control flow). No separate “memory on/off” switch for the main text route; if there are no chunks, memory section is empty.

### Memory capability summary

| Aspect | Finding |
|--------|--------|
| Retrieval | Top-k by similarity (paid) or recency (free). Cosine similarity + recency blend when embeddings available. |
| Embeddings required? | No. Free tier and fallbacks use recency-only retrieval. |
| Free vs pro/elite | Pro/elite: query embedded, similarity + recency. Free: recency-only, no excerpts in formatMemoryContext when caller passes paid=false. |
| Always injected? | In vella/text and reflection: yes when blocks exist; otherwise empty string. |
| Used for coaching vs reflection | Both: reflection API uses memory for all reflection types; vella/text uses memory for every reply. No structural difference between “coaching” and “reflection” in memory usage. |

---

## 4. Coaching Capability Depth

### Search results (implementation)

- **Structured action planning:**  
  - **agents.ts:** `runStoicStrategist` returns `StrategyResult`: `rationalPlan`, `ifThenPlans`, `mindsetForToday` (LLM, JSON). `runConversationalGuide` is not used by the text route.  
  - **reflection.ts:** `growth_roadmap` type: user content asks for JSON `shortTerm`, `midTerm`, `longTerm` arrays of actions (LLM).  
  - No dedicated “action plan” storage or follow-up system; outputs are one-off LLM responses.

- **Predefined coaching frameworks:**  
  - **agents.ts:** Clarity (facts/unknowns/assumptions/biases), Strategy (in/out of control, stoicReframe, ifThenPlans), Compass (immediate steps, calming reframe, what to avoid), Emotion (regulation strategies, shortTermPlan), Attachment (growth suggestions, journaling prompts), Identity (reflection prompts). All are **LLM-generated** from schemas; no fixed curriculum or step-by-step program.  
  - **reflection.ts:** Payload types include `stoic_coach` (JSON: principle, reframe, suggestedPractices), `growth_roadmap`, `weekly_review`, `cognitive_distortions`, `behaviour_loops`, etc. Each is a single reflection prompt + runFullAI; no multi-step coaching engine.

- **Behaviour change modules:**  
  - **lib/vella/exercises.ts:** Scripted exercises (breathing, grounding, mindfulness, stress reset). **Deterministic:** intent detection then fixed text. No LLM.  
  - **lib/insights/growthRoadmap.ts:** Builds roadmap content (includes suggestions); used by growth-roadmap API.  
  - No “module” that tracks completion, steps, or assigns next action over time.

- **Coaching vs prompt-framing:**  
  - “Execution coach” and “stoic mentor” exist as **ConversationMode** directives in `buildModeSystemPrompt` (agents.ts): one sentence added to the system prompt. They are **not** used by `/api/vella/text`.  
  - Stoic/mentor/coach wording appears in: textPrompts (“conversational partner”, “emotional presence”), personaConfig (philosophical style), reflection prompts (“Stoic reasoning engine”, “growth roadmap planner”), and lite fallback for `stoic_coach` persona.  
  - **Conclusion:** There is **no** structured action-planning pipeline or behaviour-change module. Coaching is **prompt-framed conversation**: mode directives, reflection types, and one-off tools (clarity, strategy, compass, emotion, attachment, identity, growth_roadmap, stoic_coach) are all LLM calls with structured prompts and optional JSON. Scripted content is limited to guided exercises (breathing, grounding, etc.).

### Conclusion: reflection-first, tone-modified

- **Reflection-first:** Most “intelligence” is reflection APIs (journal, checkin, emotional_patterns, life_themes, forecast, behaviour_loops, cognitive_distortions, strengths_values, growth_roadmap, stoic_coach, weekly_review, nudge) and one-off agent tools (clarity, strategy, compass, emotion, attachment, identity). All are single-shot LLM (or heuristic) responses.  
- **Coaching:** Only in the sense of prompt instructions (e.g. “lean on Stoic principles”, “clarify goals and next actions”) and one-off strategy/roadmap/stoic_coach outputs. No persistent coaching state or step-by-step programme.  
- **Tone-modified:** Relationship mode, tone profile, and persona mode only change phrasing and style in prompts.  
- **Support:** Code references: `lib/ai/agents.ts` (mode directives, runStoicStrategist, runClarityEngine, runCompassMode, runEmotionLens, runAttachmentAnalyzer, runIdentityMirror; runConversationalGuide not used by vella/text), `lib/ai/reflection.ts` (all reflection types), `lib/ai/textPrompts.ts` (single global prompt for text), `app/api/vella/text/route.ts` (textPrompts + memory + runVellaTextCompletion only).

---

## 5. Deterministic vs LLM Responsibility

| Area | Deterministic | LLM |
|------|----------------|-----|
| Behavioural state (recomputeState) | Counts, connection_depth, metadata | — |
| Trait scores (adaptiveTraits) | Full formula from signals | — |
| Connection dashboard | Score, streaks, milestones, patterns, insights, suggestions | — |
| Memory retrieval (free) | Recency-only top-k | — |
| Memory retrieval (paid) | Cosine + recency scoring | Embedding model for query + chunks |
| Main text chat (/api/vella/text) | Exercise intent + scripted reply | runVellaTextCompletion (OpenAI) |
| Reflection (all types) | — | runFullAI in callVellaReflectionAPI |
| Loops (free) | heuristicLoops | — |
| Loops (paid) | — | callVellaReflectionAPI behaviour_loops |
| Distortions (free) | heuristicDistortions | — |
| Distortions (paid) | — | callVellaReflectionAPI cognitive_distortions |
| Life themes, strengths/values, forecasts, etc. | Some heuristics | runFullAI / reflection |
| Intent (SMALLTALK, PLAYFUL, etc.) | Rule-based first (rules.ts) | classifyIntentWithLLM for remainder |
| Persona mode (soft_calm, etc.) | Keyword match | — |
| Guided exercises | Intent + scripted text | — |

---

## 6. System Constraints & Limits

### Medical / therapy disclaimer

- **lib/ai/textPrompts.ts:** “You are not a therapist, clinician, advisor, or expert. Never provide medical, diagnostic, psychological, or legal advice. Avoid all clinical terminology. If the user asks for medical/psychological help, redirect softly back to emotional presence without mentioning limitations or policies.”  
- **lib/realtime/personaSynth.ts:** Same wording in the persona safety block.  
- **Enforcement:** Prompt-only. No runtime check or redirect logic; behaviour depends on model following instructions.

### Crisis / risk detection

- **No dedicated crisis detection.**  
- **lib/ai/textPrompts.ts / personaSynth:** No “if crisis then redirect to hotline” or similar.  
- **lib/safety/complianceFilter.ts:** Post-hoc text filter: replaces phrases like “suicide”, “kill myself” with `[sensitive-content]` (when filter strength > 0.5); optional “violent”, “aggressive”, etc. with `[content-flagged]` when smoothing high. Does not trigger a different flow or block the request.  
- **lib/prediction/emotionPredictor.ts:** Returns `risk: "low" | "medium" | "high"` and a message; used for prediction/forecast UX, not for blocking or crisis routing.

### Safety filters

- **lib/safety/complianceFilter.ts:** Filter strength and output smoothing from admin tuning; topic_boundary, harmful_content_purifier, repetition_breaker, sentiment_correction from admin config. All are **text replacement** on model output (or input where applied). No hard block of requests.  
- **lib/admin/runtimeTuning.ts:** safety.filterStrength, redFlagSensitivity, outputSmoothing.  
- **personaSynth.ts:** Admin safety snippets (over_empathy_limiter, attachment_prevention) can be injected into prompt.  
- **Deterministic guardrails:** Rate limits, token quota, request validation (Zod), kill switch (`isAIDisabled()`). No deterministic “do not claim X” layer beyond prompt text.

### Hard limits (from code)

- **Authentication:** Text and reflection require authenticated user (e.g. requireUserId).  
- **Rate limits:** e.g. vella/text 5 req/60s per user; read APIs 60/60s.  
- **Token quota:** checkTokenAvailability before OpenAI; 402 when over quota.  
- **Request validation:** Message length and schema (e.g. vellaTextRequestSchema); reject invalid payloads.  
- **AI kill switch:** When `isAIDisabled()` is true, vella/text returns 503; retrieval falls back to recency-only.  
- **Tier gating:** ConversationMode (deep_reflection, execution_coach, stoic_mentor, etc.) and some features return upgrade message for free tier when those paths are used.  
- **No** built-in crisis hotline redirect, no mandatory medical disclaimer in UI, no hard “refuse to answer” for specific question types beyond prompt guidance.

---

## 7. User-Facing Surface Audit

### app/session

- Session (talk) UI: conversation history, input, voice/audio options. No display of traits, themes, loops, distortions, or connection depth in the session component. Tone/relationship can be passed to backend from settings; no mode selector in session for ConversationMode.

### app/home

- Home dashboard: greeting, mood snapshot, weekly insight, actions (Talk, Check-in, Exercises). Prediction (risk + message) fetched from prediction API; no raw behavioural state or trait numbers shown. Emotional snapshot and “You shared that you care most about” use onboarding-style reason; no themes/loops/distortions on home.

### app/insights

- **lib/hooks/useInsightsDashboard.ts** fetches themes, life themes, loops, distortions, and other insight data from APIs (/api/themes, /api/behaviour-loops, etc.).  
- **app/insights/page.tsx:** Renders themes, lifeThemes, loops, distortions (BehaviourLoopsCard, CognitiveDistortionsCard, etc.). So **themes, loops, distortions are user-visible** on the Insights page. Data comes from legacy getLifeThemes, getBehaviourLoops, getCognitiveDistortions when state is empty or state’s themes/loops/distortions are empty; when state is used first, state returns empty arrays and the same legacy APIs are used for the fallback in /api/themes.

### app/progress

- Progress page and related APIs surface progress metrics (e.g. from /api/progress, /api/connection-index). Connection index/dashboard (score, milestones, patterns, insights, shortEmotionalLine) is exposed via API and can be shown where the client calls connection-index. No raw `behavioural_state_current.state_json` in UI; only derived views (progress, connection, themes, traits, loops, distortions).

### Modes and settings

- **User-configurable:** Tone and relationship mode appear in settings/timeline/check-in (userSettings.vella.toneStyle, relationshipMode). They are passed to reflection and realtime flows.  
- **ConversationMode** (deep_reflection, stoic_mentor, etc.): Gated by tier; not selectable in the text chat path because /api/vella/text does not call runConversationalGuide.

### What the user actually experiences

- **Session (text):** Single prompt (textPrompts) + optional memory (retrieval) + runVellaTextCompletion. No mode selector; no trait/themed prompts on this route. Guided exercises when intent detected (scripted).  
- **Home:** Snapshot, prediction risk/message, actions. No traits/themes/loops.  
- **Insights:** Themes, life themes, behaviour loops, cognitive distortions (from APIs that use LLM or heuristics; state-sourced themes/loops/distortions are empty).  
- **Progress / connection:** Progress and connection dashboard (score, milestones, patterns, suggestions) when client uses those APIs.  
- **Settings:** Tone and relationship style configurable; server-side relationship default remains `best_friend` unless overridden by client.

---

## 8. What Vella Actually Is (Evidence-Based Conclusion)

- **Text chat (primary path):** Single global prompt (textPrompts) plus optional memory (retrieveTopK, formatMemoryContext) and runVellaTextCompletion. No ConversationMode, no trait hints, no mode-specific logic on this route. Prompt enforces: warm steady partner, no clinical/therapeutic claims, redirect medical/psychological requests to emotional presence, session-local continuity only, guided exercises only when explicitly requested.  
- **Reflection and insights:** Many reflection types (checkin, journal, insight, emotional_patterns, forecast, behaviour_loops, cognitive_distortions, stoic_coach, growth_roadmap, etc.) implemented as one-off runFullAI calls with typed prompts and sometimes JSON. Loops and distortions: free = heuristic, paid = LLM. Themes/strengths/identity from separate LLM or heuristic calls.  
- **Behavioural state:** Deterministic engine writes only counts and connection_depth to behavioural_state_current. Traits are computed by a deterministic formula in adaptiveTraits and (when runConversationalGuide is used) injected as short hint lines; that path is not used by the main text API. Themes/loops/distortions in state are never populated; APIs fall back to legacy LLM/heuristic implementations for what the UI shows.  
- **Memory:** Retrieval is recency-only on free tier and similarity+recency on paid; result is always injected as text when non-empty. No separate “memory on/off” for the main chat.  
- **Coaching:** No structured action plan or multi-step programme. “Coaching” is prompt framing (Stoic, execution coach, etc.) and one-off tools (strategy, compass, growth_roadmap, stoic_coach reflection). Guided exercises are fixed scripts.  
- **Safety:** Prompt-based boundaries (not therapist; no medical advice; redirect gently). Content filter does phrase replacement. Rate limits, token quota, validation, kill switch. No crisis detection or mandatory hotline redirect.  
- **Modes and persona:** Relationship and tone change only prompt text (descriptor + behaviour). ConversationMode exists and is tier-gated but is not used by the main text route. So in practice the product is a **reflection-first, tone- and prompt-shaped conversational experience** with deterministic support (traits, connection, counts, recency memory, scripted exercises) and LLM-backed reflection and insights, **without** a separate behavioural “engine” that drives different capabilities per mode, and **without** persistent coaching or action-planning architecture.

---

**End of report.** All claims are grounded in the referenced files and line-level behaviour described above.
