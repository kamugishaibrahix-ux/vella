# Behaviour Operating System Readiness Audit

**Objective:** Assess whether the current MOBILE backend can credibly support a transition to addiction recovery governance, discipline enforcement, habit tracking, focus execution tracking, behavioural state transitions, and escalation/relapse detection.  
**Scope:** Read-only forensic analysis. No redesign. No code modifications.

---

## STEP 1 — Behaviour Governance Layers Check

### A) Commitment Governance

| Question | Answer | Evidence |
|----------|--------|----------|
| Persistent commitment entity? | **No** | No table, type, or serverLocal key for commitments. Grep: only "commitment" in `lib/ai/agents.ts` (prompt: "set simple commitments"), `lib/memory/summariser.ts` (summarise "commitments"), `lib/insights/identity.ts` (description text). |
| Commitment outcome tracking? | **No** | No commitment → outcome relation or log. |
| Cadence validation (daily/weekly)? | **No** | No cadence field or rule engine. |
| Violation detection? | **No** | No violation entity or comparator. |
| Commitment streak calculation? | **No** | Streaks exist only for check-ins (depthEngine, updateProgress), not for commitments. |
| Commitment escalation logic? | **No** | None. |

**Verdict:** **Missing.** No commitment governance layer. Partial only in copy/prompts.

---

### B) Addiction & Abstinence Governance

| Question | Answer | Evidence |
|----------|--------|----------|
| Abstinence target entity? | **No** | Grep for abstinence/relapse/sobriety/violation in `lib/`: no matches. |
| Relapse event model? | **No** | No event type or table for relapse. |
| Violation detection tied to abstinence? | **No** | No abstinence concept. |
| Abstinence streak engine? | **No** | Streaks are check-in/consecutive-day only. |
| Relapse count in time window? | **No** | No relapse events to count. |
| Sobriety state classification? | **No** | No state enum or classifier. |

**Verdict:** **Completely missing.** No addiction or abstinence governance in backend.

---

### C) Habit Tracking Layer

| Question | Answer | Evidence |
|----------|--------|----------|
| Habit definition entity? | **No** | No habit table or serverLocal schema. Grep for habit_def/habit_completion: none. "Habit" only in i18n and regulation strategy category labels. |
| Habit completion log? | **No** | No completions table or log. |
| Frequency enforcement? | **No** | No rule enforcing e.g. daily/weekly habit. |
| Habit consistency score? | **No** | No habit-specific metric. |
| Habit in behavioural_state_current? | **No** | `recomputeState` writes only: progress (journal_count, checkin_count, message_count, goals_count), connection_depth, metadata. traits/themes/loops/distortions/regulation are empty in state_json. No habit field. |

**Distinction:**

- **Streak from check-ins:** Exists. `lib/connection/depthEngine.ts` `computeStreaks(checkins)` → currentStreak, longestStreak by consecutive calendar days with check-ins. `lib/progress/updateProgress.ts` has journalStreak/checkInStreak (capped counts, not true consecutive-day logic in updateProgress). So: **check-in-based engagement streaks exist; no habit entity or habit governance.**

**Verdict:** **Missing.** True habit governance (definition, completion log, frequency, consistency) is absent. Only check-in-derived engagement metrics exist.

---

### D) Discipline & Execution Engine

| Question | Answer | Evidence |
|----------|--------|----------|
| Execution tracking beyond goals? | **No** | Only goals and goal actions. No separate “execution” or “discipline” entity. |
| Focus sessions tracked? | **No** | Grep for focus_session/focusSession/planned_duration/execution: none. Only `execution_coach` mode in agents (prompt). |
| “Completed planned duration” model? | **No** | Goals have target_date and actions have due_date; no duration or completion-of-duration. |
| Execution adherence scoring? | **No** | No score derived from “did user do X when they said they would.” |
| Rule-based penalty or escalation? | **No** | No penalty or escalation on missed execution. |

**goalEngine.ts audit:**

- **Storage:** serverLocal `goals:${userId}`, `goal_actions:${userId}`.
- **Entities:** UserGoal (type life|focus|weekly, title, description, status active|paused|completed|abandoned, priority, target_date). GoalAction (goal_id, label, status pending|in_progress|done|skipped, due_date, completed_at).
- **Operations:** listGoals, createGoal, updateGoalStatus, listGoalActions, addGoalAction, updateGoalActionStatus (set status, set completed_at when done). No focus block, no planned duration, no automatic “missed” state.

**Verdict:** **Task tracking only.** goalEngine is goal + task (action) CRUD with status. Not discipline enforcement or focus execution tracking.

---

### E) Behaviour State Machine

| Question | Answer | Evidence |
|----------|--------|----------|
| behavioural_state_current snapshot or state machine? | **Snapshot** | `recomputeState` builds a single state object and upserts it. No read-modify-transition. File: `lib/engine/behavioural/recomputeState.ts` (lines 130–160): new state = { ...EMPTY_STATE, progress, connection_depth, metadata }; upsert overwrites row. |
| Explicit states (stable/at_risk/escalated/post_relapse)? | **No** | State schema is structural (traits, themes, loops, distortions, progress, connection_depth, regulation, metadata). No state label or enum. |
| Transitions rule-based or recompute-based? | **Recompute-based** | Each recompute overwrites. No transition function from previous state. |
| Does recomputeState overwrite instead of transition? | **Yes** | Full upsert by user_id. No merge with previous; no event-driven transition. |

**Architecture type:** **Snapshot model.** Current state = last recompute result. No event-driven model, no state machine with named states and transition rules.

---

### F) Escalation & Intervention Layer

| Question | Answer | Evidence |
|----------|--------|----------|
| Alerts persistent? | **No** | `lib/monitor/alerts.ts` `getPredictiveAlerts(snapshot)` returns string[] from in-memory snapshot (driftScore, clarity, tension, riskLevel). Not stored. |
| Escalation level per user? | **No** | No table or field for escalation_level. |
| Rule thresholds across days? | **No** | Risk flags and predictor use recent check-ins/session; no “if condition for N days then escalate” persistence. |
| Time-based scheduling? | **No** | No cron, queue, or scheduler. Grep: only client `setInterval` (realtime budget, UI timers), `scheduleAudioChunk` (audio playback), and comment in webhookIdempotency about “periodically (e.g. via cron)” with no implementation. |
| Nudge engine functional? | **No** | `lib/nudges/nudgeEngine.ts`: `createAndStoreNudge` always returns null; comment: “Nudges temporarily disabled under Path B privacy rules.” |

**Explicit confirmation:** No backend cron, job queue, or scheduler exists. No time-based intervention delivery.

---

### G) Risk Aggregation

| Question | Answer | Evidence |
|----------|--------|----------|
| Unified risk score? | **No** | No single risk score. Multiple separate signals. |
| Fragmented signals? | **Yes** | (1) `computeBehaviourRiskFlags`: returns BehaviourRiskFlag[] (behaviour_cycle, cognitive_rigidity, emotional_dip, resilience_dip). (2) `emotionPredictor`: returns EmotionPrediction { risk: low|medium|high, type, message } from check-ins + optional LLM. (3) Monitor: riskLevel in MonitoringSnapshot (session-only, from driftScore/clarity/tension/fatigue). No aggregation of these into one score. |
| Addiction-specific risk? | **No** | computeBehaviourRiskFlags: loops, distortions, forecast, traitDeltas. No abstinence, relapse, or substance. emotionPredictor: mood, stress, anxiety, energy. No addiction dimension. |
| Discipline-failure risk? | **No** | No “missed commitments” or “goal lapse” risk. |

**Verdict:** Risk is **fragmented** (flags, predictor, monitor). No unified score, no addiction or discipline-failure risk.

---

## STEP 2 — Architectural Classification

**Classification: Coaching Engine with Behaviour Tracking (not Behaviour Governance or Behaviour OS).**

| Label | Applicable? | Justification (file evidence) |
|-------|-------------|-------------------------------|
| **Insight Engine** | Yes | Reflection API, behaviour loops, patterns, distortions, weekly review, growth roadmap, emotional forecast—all generate insights. `lib/ai/reflection.ts`, `lib/insights/*`, `lib/forecast/*`, `lib/review/weeklyReview.ts`. |
| **Coaching Engine** | Yes | Regulation strategies, execution coach mode, micro-interventions, personalised strategies from context. `lib/regulation/generateRegulationStrategies.ts`, `lib/ai/agents.ts` (execution_coach), `lib/ai/relational/interventions.ts`. |
| **Behaviour Tracking Engine** | Partial | Check-ins, journals, goals, goal actions, and behavioural_state_current (counts + connection_depth) are persisted. No commitment/habit/relapse/violation tracking. `lib/checkins/db.ts`, `lib/goals/goalEngine.ts`, `lib/engine/behavioural/recomputeState.ts`. |
| **Behaviour Governance Engine** | No | No commitment or abstinence governance, no violation/relapse detection, no rule-based enforcement or escalation, no scheduled interventions. |
| **Behaviour Operating System** | No | OS implies governance, state machine, escalation, scheduling. All missing. |

**Conclusion:** Vella is an **Insight + Coaching Engine** with **partial behaviour tracking** (engagement and goals). It is **not** a Behaviour Governance Engine or Behaviour OS today.

---

## STEP 3 — Behaviour OS Gap Map

| Layer | Exists | Partial | Missing | Required Build Type |
|-------|--------|---------|---------|---------------------|
| Commitment governance | | | ✓ | New metadata table (commitments, outcomes); new deterministic engine (cadence validation, streak, violation); optional escalation level field. |
| Addiction & abstinence | | | ✓ | New metadata tables (abstinence target, relapse events); new deterministic engine (abstinence streak, relapse count in window); sobriety state classification. |
| Habit tracking | | | ✓ | New metadata tables (habit definitions, habit completions); new engine (frequency check, consistency score); optional integration into behavioural_state or separate API. |
| Discipline & execution | | ✓ (goals only) | ✓ | Task tracking exists (goalEngine). New: focus session entity + planned_duration; “completed planned duration” engine; execution adherence score; optional penalty/escalation rules. |
| Behaviour state machine | | ✓ (snapshot) | ✓ | Snapshot exists. Required: state machine refactor—named states (e.g. stable/at_risk/escalated), transition rules, event-driven or rule-based transitions instead of full overwrite. |
| Escalation & intervention | | | ✓ | Alerts are transient. Required: persistent escalation level per user; rule thresholds across days; scheduler addition for time-based interventions; nudge engine re-enabled or replaced. |
| Risk aggregation | | ✓ (fragmented) | ✓ | Required: risk aggregation layer—single or composite risk score; optional addiction-specific and discipline-failure risk modules. |

---

## STEP 4 — Minimum Clean Transition Plan

Backend-only, structural. No marketing.

### Addiction Recovery System

- **New entities (metadata only):** Abstinence target (user_id, target_type/code, started_at, optional goal_duration_days). Relapse/violation events (user_id, occurred_at, target_type, optional severity/code).
- **Engines:** Abstinence streak from target + events (consecutive days since last violation). Relapse count in configurable window (e.g. 30/90 days). Optional: sobriety state classifier (e.g. stable / at_risk / post_relapse) from streak and recent events.
- **State transitions:** Optional: store sobriety_state (code) and last_updated; recompute from streak and relapse count.
- **Scheduler/rule engine:** Optional: time-based check (e.g. daily) to update streak and state; no user content. No intervention delivery required for “minimum.”

### Discipline Builder

- **New entities (metadata only):** Commitments (user_id, commitment_type/code, cadence e.g. daily/weekly, created_at). Commitment outcomes (user_id, commitment_id, date, met/missed code).
- **Engines:** Cadence validation (expected vs actual outcomes). Commitment streak (consecutive met). Violation detection (missed expected occurrence). Optional: discipline state (on_track / lapsed / recovering).
- **State transitions:** Optional: discipline_state and last_updated from streak and violation rules.
- **Scheduler/rule engine:** Optional: daily/weekly job to evaluate outcomes vs cadence and update violation/streak/state.

### Focus Execution OS

- **New entities (metadata only):** Focus sessions (user_id, started_at, ended_at, planned_duration_sec, optional goal_id). Optional: focus block definition (user_id, label/code, planned_duration_sec).
- **Engines:** “Completed planned duration” (ended_at - started_at >= planned_duration_sec or user-confirmed complete). Aggregate: focus time per day/week, completion rate.
- **State transitions:** Optional: in_focus / idle from current session; or focus_consistency tier from completion rate.
- **Scheduler/rule engine:** Not required for minimum (start/end are user or client driven).

### Cross-cutting

- **Scheduler:** One deterministic scheduler (cron or queue) to run: optional daily abstinence/discipline state update; optional time-based intervention dispatch (e.g. “send nudge at 9am” as notification id only). Today: none.
- **Escalation:** Optional table or column: user_id, escalation_level (0–3), last_updated; updated by rules (e.g. risk flags + violation count over N days).

---

## STEP 5 — Brutal Strategic Verdict

**Can Vella credibly transition to Behaviour OS within current architecture?**  
**Yes, but only by adding new layers.** The current design is snapshot-based, insight/coaching-oriented, with no commitment, abstinence, habit, or escalation. There is no state machine and no scheduler. Transition is **additive**: new tables, new deterministic engines, optional state-machine refactor and scheduler. The existing reflection, coaching, check-ins, goals, and risk flags can **feed** a future governance layer but do not constitute it.

**Is the architecture extensible enough?**  
**Yes.** Persistence is Supabase + serverLocal; APIs are route-based; recomputeState is a single function. New metadata tables and engines can be added without rewriting existing insight or coaching paths. Behavioural_state_current can be extended with new keys or a parallel “governance_state” table. The main gap is **no event model** for violations/relapses/completions—adding that is additive (new tables + engines).

**Rewrite or additive layers?**  
**Additive layers.** No need to replace reflection, goals, or check-ins. Need: new entities (commitments, outcomes, abstinence, relapse, focus sessions), new engines (streaks, violation detection, completion logic), optional state machine (named states + transitions), and a scheduler. Refactor of recomputeState to a true state machine would be a design choice, not a full rewrite.

**3-month or 12-month build?**  
**Closer to 6–12 months** for a **credible** Behaviour OS (all three: addiction recovery, discipline builder, focus execution), if one includes:

- Design and implementation of commitment, abstinence, habit, and focus-session models and APIs.
- Deterministic engines (streaks, violations, relapse counts, completion rates).
- State machine or governance-state design and integration.
- Scheduler and time-based intervention pipeline (and any notification integration).
- Risk aggregation and optional escalation.
- Testing and iteration.

A **minimal** slice (e.g. one of the three product positions plus one new entity and one engine) could be **~3 months**. Full Behaviour OS with addiction + discipline + focus + escalation + scheduler is **not** a 3-month build from the current codebase without cutting scope or quality.

**Honest summary:** The backend is a strong base for insight and coaching and can be extended to support behaviour governance, but it is **not** today a Behaviour OS. The gap is structural (missing entities, engines, state model, scheduler), not a single feature. Credible transition is **additive and multi-quarter**, not a small patch.
