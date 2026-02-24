# Vella Backend Capability & UX Requirements Audit

Evidence-based. File paths and line numbers cited. No speculation.

---

## Executive Summary

The backend implements a deterministic governance engine; all behavioural signals are derived from metadata (event counts, state codes). The LLM does not write governance state. No user free text is stored in Supabase; content tables are write-blocked; writes go through `safeSupabaseWrite`. Journals/conversations use local IndexedDB with encryption for content. Eight behavioural layers (Phase 1–8) inject structured signals into the prompt; mode resolution is rule-based. None of the backend signals (riskScore, escalationLevel, firmnessLevel, mood, stance, trends, value alignment, etc.) are returned in the API response or referenced in the app UI; they are invisible to the user unless surfaced by design.

---

## SECTION 1 — Core Architecture Verification

### 1.1 Hybrid Structure

| Claim | Evidence |
|-------|----------|
| **Deterministic governance engine exists** | `MOBILE/lib/governance/stateEngine.ts` lines 41–156: `computeGovernanceState(userId)` reads behaviour_events, commitments, abstinence_targets, focus_sessions; computes recovery_state, discipline_state, focus_state, governance_risk_score, escalation_level via pure functions (lines 158–210). No LLM calls. Comment line 3: "Computes ... from behaviour_events ... No AI. No reflection. Pure rules." |
| **LLM does NOT write governance state** | `MOBILE/lib/ai/textEngine.ts`: `runVellaTextCompletion` only calls OpenAI and returns a string (lines 34–93). No call to `computeGovernanceState` or any write. Route `MOBILE/app/api/vella/text/route.ts`: after `runVellaTextCompletion` only `recordEvent` (crisis path) and `recordConversationMetadataV2` (metadata only) are called; no governance state write from LLM output. |
| **All behavioural signals from metadata only** | Snapshot built in `buildBehaviourSnapshot` from governance (riskScore, escalationLevel, recoveryState, disciplineState, focusState), violation counts (numbers), focusSessionsLast7d, contradiction (boolean + ids), boundary (type + severity). Guidance, identity, longitudinal, value alignment all take counts/codes only. `MOBILE/lib/governance/behaviourSnapshot.ts` lines 74–125. |
| **No free-text stored in Supabase** | `MOBILE/lib/safe/safeSupabaseWrite.ts` lines 48–55: `WRITE_BLOCKED_TABLES` includes journal_entries, conversation_messages, check_ins, memory_chunks, user_reports, user_nudges. Lines 26–45: `BANNED_FIELDS` includes content, text, message, note, summary, transcript, etc. Lines 169–176: `ensureNotBlockedTable` throws on write to those tables. `MOBILE/lib/conversation/db.ts` lines 54–59: `insertConversationMessage` throws "[SAFE-DATA] conversation_messages is write-blocked." |
| **All writes through safeSupabaseWrite** | `safeUpsert` used in stateEngine (line 144), recomputeState (line 164). `safeInsert` used in events.ts (line 99), conversation/db.ts (line 77), etc. Grep: all insert/upsert in lib go through safeInsert or safeUpsert from `@/lib/safe/safeSupabaseWrite`. |
| **Local-first encryption for journals/conversations** | `MOBILE/lib/local/db/journalRepo.ts` lines 7, 22–23, 50–51: `encryptField`/`decryptField` for title and content. `MOBILE/lib/local/db/conversationRepo.ts` lines 2, 7, 24, 37, 50: "IndexedDB-backed conversation repository with encryption for content." `MOBILE/lib/local/encryption/crypto.ts` lines 47–64: AES-GCM with AAD. Key in localStorage (line 9). |

---

## SECTION 2 — Behavioural Intelligence Layers

### 2.1 Governance Engine

| Item | Source | Inputs | Where used | Exposed to LLM |
|------|--------|--------|------------|----------------|
| riskScore | stateEngine.ts lines 107–113, 191–202: `computeGovernanceRiskScore(abstinenceViolations7d, commitmentViolations7d, focus_state, focusSessionsLast30d)`; score 0–10 | Event counts 7d, focus state, session count | governance_state.state_json.governance_risk_score; readState.ts 67; snapshot, guidance, identity, modeResolver | Yes (in Behaviour Snapshot and downstream blocks) |
| escalationLevel | stateEngine.ts lines 114, 205–210: `computeEscalationLevel(governance_risk_score)`; 0–3 from risk bands | governance_risk_score | state_json.escalation_level; readState 68; snapshot, modeResolver, identity | Yes |
| recoveryState | stateEngine.ts lines 96, 158–165: `computeRecoveryState(activeAbstinenceCount, abstinenceViolations7d)`; codes ok, at_risk, relapse, na | Abstinence count, violations 7d | state_json.recovery_state; snapshot, guidance | Yes (in snapshot JSON) |
| disciplineState | stateEngine.ts lines 97–101, 168–177: `computeDisciplineState(commitments, violations7d, completed7d)`; on_track, slipping, off_track, na | Commitments, violations/completions 7d | state_json.discipline_state; snapshot, guidance | Yes |
| focusState | stateEngine.ts lines 104–106, 180–189: `computeFocusState(sessions, completed7d, focusStartNoEnd7d)`; active, idle, overdue, na | Focus sessions, completed 7d, starts without end | state_json.focus_state; snapshot, guidance | Yes |
| Stored shape | stateEngine.ts lines 115–122, 134–139: state_json = { recovery_state, discipline_state, focus_state, governance_risk_score, escalation_level, last_computed_at_iso }; upserted to governance_state (line 144) | — | — | — |

### 2.2 Pattern Injection Layer (Phase 1)

- **Structure:** `MOBILE/lib/governance/behaviourSnapshot.ts` lines 16–38: BehaviourSnapshot type.
- **Fields injected:** riskScore, escalationLevel, recoveryState, disciplineState, focusState, recentCommitmentViolations, recentAbstinenceViolations, focusSessionsLast7d, contradictionDetected, contradictedCommitmentIds, boundaryTriggered, boundaryType?, boundarySeverity?, guidanceSignals?, identitySignals?, longitudinalSignals?, valueAlignmentSignals?.
- **Where injected:** `MOBILE/lib/ai/textPrompts.ts` line 17: BEHAVIOURAL SNAPSHOT block with `JSON.stringify(opts.behaviourSnapshot)`; line 368: `${behaviourSnapshotBlock}${guidanceBlock}...` before User said.
- **No free text:** Snapshot built from governance fields, violation counts (numbers), contradiction (boolean + commitment ids), boundary (type enum, severity); no userMessage or matchedTerms in snapshot (boundaryDetector matchedTerms not passed to snapshot; behaviourSnapshot.ts lines 59–64 only boundaryTriggered, boundaryType, boundarySeverity).
- **Not stored:** Snapshot is built per request and passed only to buildVellaTextPrompt; not written to DB (no table holds BehaviourSnapshot).

### 2.3 Commitment Contradiction Engine (Phase 2)

- **Where commitments read:** `MOBILE/app/api/vella/text/route.ts` line 187: `getActiveCommitmentsMetadata(userId)` from readState; `MOBILE/lib/governance/readState.ts` lines 126–134: fromSafe("commitments").select("id, subject_code, created_at").eq("status", "active").
- **How contradiction detected:** `MOBILE/lib/governance/contradiction.ts` lines 19–44: `detectCommitmentContradiction(userMessage, activeCommitments)`; subject_code mapped to keyword lists (lines 8–14); case-insensitive `lower.includes(kw)` (line 34). String match only; no LLM.
- **Effect on mode:** `MOBILE/lib/ai/modeResolver.ts` lines 59–61: if `contradictionDetected && (requestedMode === "listen" \|\| null \|\| "")` → return "challenge".
- **Effect on prompt:** textPrompts.ts lines 20–23: when `contradictionDetected === true`, COMMITMENT CONTRADICTION block added with instruction to surface inconsistency calmly.

### 2.4 Boundary & Respect Engine (Phase 3)

- **Implementation:** `MOBILE/lib/safety/boundaryDetector.ts`: `detectBoundarySignal(userMessage)` (lines 71–99); SEVERITY_1_TERMS and SEVERITY_2_TERMS (lines 14–46); substring match, case-insensitive; returns BoundarySignal { boundaryTriggered, boundaryType, severity 0|1|2, matchedTerms } (matchedTerms are keywords only, not full message). No LLM imports.
- **Severity:** 0 = none, 1 = mild (e.g. stupid, shut up), 2 = aggressive/threatening (e.g. hurt you, kill you).
- **Effect on mode:** modeResolver.ts lines 48–56: boundarySeverity === 2 → "coach"; boundarySeverity === 1 and (vent \| listen) → "challenge".
- **Effect on identity:** identityEngine uses boundarySeverity for mood (hurt/firm), stance (boundary_enforce), standardsLevel (2 or 3).
- **Effect on prompt:** textPrompts.ts lines 25–27: BOUNDARY & RESPECT block when boundaryTriggered; instructions for calm boundary, ask what led them, no retaliation.

### 2.5 Guidance Signals (Phase 4)

- **FirmnessLevel 0–4:** guidance.ts lines 82–97: escalationLevel >= 2 → 4; else sum from riskScore >= 4, >= 6, escalationLevel >= 1, contradictionDetected, boundarySeverity 2 (+2) or 1 (+1); clamped.
- **EarnedValidationLevel 0–3:** lines 100–119: low risk + commitmentCompleted7d >= 3 and 0 violations → 2; >= 5 completions and 0 violations → 3; focus on_track + focusSessionsLast7d >= 4 bumps; reasons CONSISTENT_COMPLETIONS_7D, ZERO_VIOLATIONS_7D, FOCUS_ON_TRACK.
- **OutcomeProjectionLevel 0–3:** lines 126–156: violations7d >= 2 or abstinence >= 1 → 2; escalation >= 1 → at least 2; riskScore >= 7 → 3; contradiction → at least 1; messageStyle gentle (1–2) or direct (3).
- **Reason allowlists:** EARNED_VALIDATION_REASONS (lines 27–31), OUTCOME_PROJECTION_REASONS (lines 34–39).
- **Prompt injection:** textPrompts.ts lines 30–42: GUIDANCE SIGNALS block with JSON (firmnessLevel, earnedValidationLevel, earnedValidationReasons, projectionLevel, projectionStyle, projectionReasons) and instruction lines.
- **All reason codes:** CONSISTENT_COMPLETIONS_7D, ZERO_VIOLATIONS_7D, FOCUS_ON_TRACK, REPEATED_VIOLATIONS_7D, ABSTINENCE_VIOLATION_7D, ELEVATED_RISK_SCORE, ESCALATION_RISING, COMMITMENT_CONTRADICTION.

### 2.6 Identity Layer (Phase 5)

- **VellaMood:** identityEngine.ts lines 7–14: calm, curious, encouraged, disappointed, protective, firm, hurt.
- **VellaStance:** lines 16–22: soft_support, direct_support, reflective_probe, reality_check, boundary_enforce, grounding.
- **StandardsLevel:** lines 24, 55–59, 73–85: 0–3; boundarySeverity 2 → 3, 1 → 2; +1 contradiction, +1 projectionLevel >= 2; clamped.
- **Deterministic mapping:** lines 61–128: mood from escalation, boundary, earnedValidation, contradiction, projection; stance from escalation, boundary, contradiction, projection, firmnessLevel >= 3.
- **Injection:** textPrompts.ts lines 46–49: IDENTITY SIGNALS (Structured — Do Not Roleplay) with mood, stance, standardsLevel, reasons.
- **Guardrails in prompt:** "Do NOT claim to be human. Do NOT invent personal memories, dreams, or needs. Do NOT guilt-trip or seek reassurance."

### 2.7 Longitudinal Drift (Phase 6)

- **30-day logic:** readState.ts: getViolationAndCompletionCounts30d (lines 125–143), getFocusSessionsCountLast30d (148–156), getPriorViolationTrendSnapshot (164–183) — 4 weeks commitment_violation counts oldest to newest.
- **Trend detection:** trendEngine.ts: disciplineTrend/recoveryTrend/focusTrend from priorTrendSnapshot (increasing → declining, completions high + violations low → improving), alternating → cyclical (lines 43–66, 67–120).
- **Cycle detection:** detectCyclical (spikes above mean, 2+ with gap), isAlternating (lines 43–66); cycleDetected = true when alternating or cyclical (line 117).
- **Where injected:** textPrompts.ts lines 52–55: LONGITUDINAL PATTERN SIGNALS block; route passes longitudinalInput to buildBehaviourSnapshot (route.ts 191–210).
- **UX implication:** Backend exposes disciplineTrend, recoveryTrend, focusTrend, cycleDetected, reasons; API does not return them. Any timeline or pattern graph would need these (or equivalent) exposed.

### 2.8 Value Alignment (Phase 7)

- **Value storage:** Spec: values in IndexedDB locally. Server receives only activeValues (string[] of value_code) in request body; validationSchemas.ts lines 40–41: activeValues optional array, max 20 items, valueCodeSchema 1–50 chars.
- **Alignment rules:** valueAlignment.ts: discipline + commitmentViolations7d >= 2 → misaligned (DISCIPLINE_VIOLATION); health + abstinenceViolations7d >= 1 → misaligned (HEALTH_CONFLICT); completions high + violations low → aligned (VALUES_ALIGNED). Lines 66–95.
- **Misalignment detection:** Lines 69–75: per value code; misalignedValues and reasons pushed; no server free text.
- **Prompt injection:** textPrompts.ts lines 58–61: VALUE ALIGNMENT SIGNALS with misalignmentDetected, alignedValues, misalignedValues, reasons; "Do not shame. Ask a reflective question."
- **No server free text:** Only value_code strings in request; no storage of value text server-side.

### 2.9 Personality Profile (Phase 8)

- **Constants:** personalityProfile.ts: VELLA_PERSONALITY { intellectualStyle: "stoic", moralBias: "accountability_first", conversationalStandard: "direct_but_fair", toleranceForExcuses: 1 }. Lines 15–20.
- **Where injected:** textPrompts.ts line 64: personalityBlock with JSON.stringify(VELLA_PERSONALITY); line 67: injected after Language, before CORE BEHAVIOUR.
- **Mutable:** No. Constant; comment "Do not mutate" (line 14).
- **Guardrails in prompt:** "Maintain consistent worldview. Prefer accountability over reassurance. Never flatter. Never seek validation."

---

## SECTION 3 — Signal Exposure Matrix

| Signal | Exists | Deterministic | Stored | Injected to LLM | User-visible today? | Requires UX surface? |
|--------|--------|---------------|--------|-----------------|---------------------|----------------------|
| riskScore | Yes | Yes | Yes (governance_state.state_json) | Yes (snapshot + guidance) | No | Optional (risk/state indicator) |
| escalationLevel | Yes | Yes | Yes (state_json) | Yes (snapshot, mode, identity) | No | Optional (crisis/mode context) |
| recoveryState | Yes | Yes | Yes (state_json) | Yes (snapshot) | No | Optional (recovery state) |
| disciplineState | Yes | Yes | Yes (state_json) | Yes (snapshot, guidance) | No | Optional (discipline state) |
| focusState | Yes | Yes | Yes (state_json) | Yes (snapshot, guidance) | No | Optional (focus state) |
| commitmentViolations7d | Yes | Yes | No (derived from events read) | Yes (snapshot as recentCommitmentViolations) | No | Optional (integrity/trend) |
| abstinenceViolations7d | Yes | Yes | No (derived) | Yes (snapshot) | No | Optional (recovery trend) |
| commitmentCompleted7d | Yes | Yes | No (derived) | Yes (guidance/earned validation) | No | Optional (progress) |
| focusSessionsLast7d | Yes | Yes | No (count from focus_sessions) | Yes (snapshot) | No | Optional (focus activity) |
| contradictionDetected | Yes | Yes | No | Yes (snapshot, contradiction block, mode) | No | Optional ("why challenge") |
| boundarySeverity | Yes | Yes | No | Yes (snapshot, mode, identity) | No | Invisible; optional (boundary feedback) |
| firmnessLevel | Yes | Yes | No | Yes (guidance block, mode) | No | Optional (tone/firmness) |
| earnedValidationLevel | Yes | Yes | No | Yes (guidance block) | No | Yes (to show "earned praise") |
| projectionLevel | Yes | Yes | No | Yes (guidance, identity) | No | Optional (consequence clarity) |
| longitudinal trends | Yes | Yes | No | Yes (longitudinal block) | No | Yes (pattern/drift) |
| value misalignment | Yes | Yes | No | Yes (value alignment block) | No | Yes (values vs behaviour) |
| mood | Yes | Yes | No | Yes (identity block) | No | Optional (mood indicator) |
| stance | Yes | Yes | No | Yes (identity block) | No | Optional (approach) |
| standardsLevel | Yes | Yes | No | Yes (identity block) | No | Optional (standards explanation) |
| personality profile | Yes | Yes | No (code constant) | Yes (personality block) | No | Invisible (no UX surface) |

API response (route.ts 277–285): { reply, resultType, emotionIntel: null, sessionState: null }. No signal fields returned. Grep of app *.tsx for riskScore, escalationLevel, mode_enum, finalMode: no matches — no UI currently displays these.

---

## SECTION 4 — UX Implication Extraction

Based strictly on backend capabilities:

| Capability | UX surface required to expose meaningfully? | Currently invisible? | Hiding reduces perceived intelligence? | Suggested surface type (requirement only) |
|------------|---------------------------------------------|----------------------|----------------------------------------|------------------------------------------|
| Governance state (risk, escalation, recovery, discipline, focus) | Yes, if user should see "where they stand" | Yes | Partially (user cannot see why mode or tone changed) | Visual indicator or state label; optional dashboard |
| Mode (vent/listen/challenge/coach/crisis) | Yes, if user should understand why tone/approach varies | Yes (mode not in response) | Yes | Mode or "approach" indicator; optional "why this mode" |
| Earned validation | Yes | Yes | Yes ("you've earned this" has no visible trigger) | Visual or copy that reflects earnedValidationLevel / reasons |
| Outcome projection | Partially | Yes | Partially | "Why I'm saying this" or consequence clarity when projectionLevel >= 2 |
| Longitudinal trends / cycle | Yes | Yes | Yes (pattern/drift not visible) | Timeline or pattern graph; drift/cycle indicator |
| Value alignment / misalignment | Yes | Yes | Yes (values vs behaviour not visible) | Values section + alignment/misalignment indicator or reflective prompt |
| Boundary (respect) | Optional | Yes | Partially | Calm boundary feedback without repeating user text; optional standards explanation |
| Mood / stance | Optional | Yes | Partially | Mood or stance indicator if product wants "how Vella is responding" |
| Personality profile | No (global stance) | Yes | No | No UX surface required; guardrails are behavioural only |
| Commitment contradiction | Optional | Yes | Partially | "Why I'm challenging" when contradictionDetected |

Required UX surfaces implied by backend (list only; no UI design):

- **Earned validation:** A way to show that praise or acknowledgment is data-driven (completions/violations), e.g. indicator or copy tied to earnedValidationLevel/reasons.
- **Longitudinal / drift:** A way to show discipline/recovery/focus trend and cycle (e.g. timeline, trend line, or "pattern detected").
- **Value alignment:** A way to show declared values and alignment/misalignment with behaviour (e.g. values list + aligned/misaligned + reflective prompt).
- **Mode or approach:** A way to show or explain current mode (or "approach") so tone changes are interpretable.
- **Governance state (optional):** A way to show risk/recovery/discipline/focus state if "where I stand" is desired.
- **Transparency (optional):** "Why I'm saying this" or "why challenge" when contradiction or projection is high.

---

## SECTION 5 — Emotional Positioning Audit

| Claim | Verdict | Structural evidence |
|-------|---------|---------------------|
| **Adaptive Personal Partner** | Partially | Mode (vent/listen/challenge/coach/crisis) and firmness 0–4 adapt to governance and boundary; identity mood/stance adapt. No per-user persistence of "relationship" state; adaptation is request-scoped. |
| **She Sees Through Me** | Partially | Contradiction (commitment vs message), value alignment (declared values vs 7d behaviour), longitudinal trends and cycle, and projection level all provide "sees through" signals. These are injected into the LLM only; not returned to client. User does not see *that* she sees (no transparency layer in API). |
| **Standards-Based Companion** | Yes | StandardsLevel 0–3, boundary handling, personality (accountability_first, direct_but_fair), "Never flatter. Never seek validation" in prompt. identityEngine + personalityProfile + boundary block. |
| **Behavioural Mirror** | Partially | Snapshot, guidance, longitudinal, value alignment encode behaviour; all injected into LLM. Mirror is backend-only; no mirror data in API response for user to see. |
| **Rational Emotional Intelligence** | Yes | Deterministic mood/stance from rules; no romance/dreams/"I need you"; personality guardrails; boundary instructions (calm boundary, no retaliation). identityEngine + personalityProfile + textPrompts blocks. |

---

## SECTION 6 — Missing Backend for Elite UX

Evidence-only gaps that would limit the following:

| UX goal | Backend gap (evidence) |
|---------|------------------------|
| **Deep timeline visualisation** | No API returns event-level or weekly series for the client. getPriorViolationTrendSnapshot and 30d counts exist but are used only server-side for longitudinalSignals. No endpoint exposes time-series (e.g. violations/completions per week) for charts. |
| **Pattern graphs** | Trend and cycle are computed (trendEngine) and injected into prompt only. No API returns disciplineTrend, recoveryTrend, focusTrend, cycleDetected, or priorTrendSnapshot for client-side graphing. |
| **Progress scoring** | riskScore and escalationLevel exist; no single "progress score" or "integrity score" is computed or returned. No endpoint returns a user-facing progress or score metric. |
| **Behaviour heatmaps** | No backend aggregation by day/week for heatmap (e.g. activity/violation by day). Raw events could be read via listEvents but not exposed as a dedicated heatmap API. |
| **Commitment integrity score** | commitmentViolations7d and commitmentCompleted7d exist; no derived "integrity score" or "commitment score" is returned. Contradiction is boolean + ids, not a numeric score. |
| **Drift severity indicator** | disciplineTrend/recoveryTrend/focusTrend and cycleDetected exist; no single "drift severity" number or tier is computed or returned. |
| **Relationship depth index** | No backend concept of "relationship depth" or persistent attachment state. All signals are request-scoped or governance state (risk/escalation); no stored "depth" or "bond" metric. |

---

## SECTION 7 — Final Backend Maturity Classification

**Classification: Early Behavioural Operating System**

**Justification (structural evidence):**

- **Behavioural engine:** Deterministic governance (stateEngine), snapshot (behaviourSnapshot), mode resolution (modeResolver), and eight layers (contradiction, boundary, guidance, identity, longitudinal, value alignment, personality) form a rule-based behavioural stack. All inputs are metadata/codes/counts; no LLM in signal computation.
- **Structured companion:** Mode, firmness, earned validation, projection, mood, stance, standards, trends, value alignment, and personality are all defined and injected into the prompt. Response shape is standard (reply + resultType); no structured "reason" or "signals" in the response.
- **Not only "AI chat":** Architecture clearly separates governance, behavioural signals, and LLM; multiple layers affect tone and content.
- **Not yet "Mature Behavioural OS":** (1) No API exposure of signals for UX (no timeline, pattern, or transparency endpoints). (2) No user-facing progress/integrity/drift scores. (3) No relationship/depth model. (4) Conversation and journal content are local-only; server has no conversation text for deeper behavioural analysis. (5) Values and timeline data exist only in request or server-side computation, not in a dedicated analytics or transparency API.

Evidence: stateEngine.ts (deterministic state), behaviourSnapshot.ts (single snapshot type), textPrompts.ts (nine injected blocks), modeResolver.ts (pure function), route returns only reply/resultType (no signals). No route or handler returns riskScore, mode, firmnessLevel, mood, trends, or value alignment to the client.
