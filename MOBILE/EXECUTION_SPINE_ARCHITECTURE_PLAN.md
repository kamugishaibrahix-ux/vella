# Execution Spine Architecture Plan

**Status:** Pre-Coding Design Phase  
**Scope:** Layer 2 — Commitment → Trigger → Outcome → Adaptation loop  
**Constraint:** STRICT ARCHITECTURAL ANALYSIS — No Code, No Migrations, No UI  
**Date:** 2026-02-24  

---

## Executive Summary

### Core Finding

**Execution Spine must live as a separate orchestration domain that READS governance and WRITES events — never the reverse.**

Governance (`stateEngine.ts`) is already a deterministic function of `behaviour_events` + `commitments` + `abstinence_targets` + `focus_sessions`. It computes `recovery_state`, `discipline_state`, `focus_state`, and `governance_risk_score`. This must remain pristine.

Execution Spine adds:
1. **Temporal logic** (window-based triggers)
2. **Outcome logging** (structured completion/skip/miss events)
3. **Drift detection** (pattern analysis on outcomes)
4. **Adaptive rules** (cadence adjustment based on drift)

All of this must feed **into** the event log so governance can compute from it — never bypass governance to write state directly.

### Architectural Verdict

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE                          │
│         (Session, Commitment Builder, Inbox)                 │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              LOCAL ENCRYPTED LAYER                         │
│  (IndexedDB: commitment descriptions, templates, outcomes)   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              EXECUTION SPINE (NEW — Layer 2)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Trigger    │  │   Drift      │  │ Adaptation │       │
│  │  Evaluator   │  │  Detection   │  │   Rules    │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │               │
│         └─────────────────┴─────────────────┘               │
│                         │                                   │
│         ┌───────────────▼───────────────┐                  │
│         │      behaviour_events         │                  │
│         │   (commitment_outcome_logged) │                  │
│         │   (trigger_fired)             │                  │
│         │   (drift_detected)            │                  │
│         └───────────────────────────────┘                  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              GOVERNANCE SPINE (Layer 1)                    │
│         (EXISTS — NO CHANGES ALLOWED)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   stateEngine│  │  readState   │  │  validation  │       │
│  │   (compute)  │  │  (queries)   │  │  (zod/codes) │       │
│  └──────┬───────┘  └──────────────┘  └──────────────┘       │
│         │                                                  │
│         ▼                                                  │
│   governance_state (computed, idempotent)                   │
└─────────────────────────────────────────────────────────────┘
```

### Critical Invariants

| Invariant | Enforcement |
|-----------|-------------|
| No free-text in Supabase | `safeSupabaseWrite.ts` BANNED_FIELDS + WRITE_BLOCKED_TABLES |
| Governance never calls Execution | Unidirectional: Execution → Events → Governance |
| Deterministic trigger eval | All triggers based on commitment metadata + wall-clock |
| Event-sourced outcomes | All state changes logged to behaviour_events first |
| Metadata-only orchestration | Server stores codes; client stores descriptions |

---

## 1️⃣ Domain Separation Analysis

### 1.1 Why Execution Spine Must Be Separate

**Governance is already a pure function:**
```
governance_state = f(behaviour_events, commitments, abstinence_targets, focus_sessions)
```

**Evidence:** `lib/governance/stateEngine.ts:41-60`
- Reads from: `behaviour_events`, `commitments`, `abstinence_targets`, `focus_sessions`
- Writes to: `governance_state` ONLY
- No side effects, no external calls

**If Execution Spine lived inside Governance:**
- Risk: Circular dependency (Execution needs governance_state to decide escalation)
- Risk: Governance bloat (temporal logic doesn't belong in recovery/discipline/focus computation)
- Risk: Determinism leak (Execution has "now()" dependency; Governance should be replayable)

**Correct separation:**
- Governance: **What is the user's state?** (computed from history)
- Execution: **What should happen next?** (reads state, proposes actions, logs outcomes)

### 1.2 Coupling Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Execution reads governance_state directly | HIGH | Execution reads via `readState.ts` APIs only; never queries governance_state table directly |
| Execution writes to governance_state | CRITICAL | **FORBIDDEN** — Execution only writes to behaviour_events |
| Governance reads Execution tables | LOW | Governance doesn't need Execution tables; it reads events |
| Shared validation schemas | MEDIUM | `validation.ts` contains both; ensure Execution adds new schemas, doesn't modify existing |
| Event type overlap | MEDIUM | Add new event types in validation.ts; don't repurpose existing |

### 1.3 Layer Architecture (Explicit)

```
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 3: ADAPTIVE ORCHESTRATION (Future)                          │
│ • ML-based timing optimization (NOT PLANNED for Phase 2)           │
│ • Cross-user pattern learning (NOT PLANNED — privacy violation)     │
│ • Intent prediction (NOT PLANNED — creepiness risk)                 │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ reads
┌─────────────────────────────┼──────────────────────────────────────┐
│ LAYER 2: EXECUTION SPINE    │                                      │
│                             │                                      │
│ ┌─────────────────┐  ┌──────┴──────────┐  ┌──────────────────┐       │
│ │ Commitment Mgr  │  │ Trigger Engine  │  │ Outcome Logger   │       │
│ │ (extract, edit) │  │ (eval, fire)    │  │ (complete, skip) │       │
│ └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘       │
│          │                    │                    │                │
│          └────────────────────┴────────────────────┘                │
│                               │                                     │
│                    ┌──────────▼──────────┐                          │
│                    │  behaviour_events   │                          │
│                    │ (outcome_logged)  │                          │
│                    │ (trigger_fired)   │                          │
│                    │ (drift_flagged)   │                          │
│                    └──────────┬──────────┘                          │
└───────────────────────────────┼──────────────────────────────────────┘
                                │ feeds
┌───────────────────────────────▼──────────────────────────────────────┐
│ LAYER 1: GOVERNANCE SPINE (Behaviour OS)                             │
│                                                                     │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│ │ stateEngine     │  │ readState       │  │ validation      │        │
│ │ (compute)       │  │ (query)         │  │ (zod/codes)     │        │
│ └────────┬────────┘  └─────────────────┘  └─────────────────┘        │
│          │                                                          │
│          ▼                                                          │
│   ┌──────────────┐                                                  │
│   │governance_state│  recovery_state, discipline_state, focus_state  │
│   └──────────────┘                                                  │
│                                                                     │
│ Invariants:                                                         │
│ • Pure function of events + commitments                             │
│ • No "now()" dependency                                             │
│ • No Execution imports                                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Communication Rules:**
1. Execution reads governance_state via `readState.ts` APIs (directional)
2. Execution writes events → Governance recomputes (event-driven)
3. No direct table writes between layers
4. No shared mutable state

---

## 2️⃣ Data Flow Design

### 2.1 Complete Lifecycle Mapping

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: USER CONVERSATION                                                    │
│ Location: Client — Session page                                            │
│                                                                              │
│ User: "I want to work out 3 times a week, mornings"                          │
│                                                                              │
│ ↓                                                                            │
│ AI Layer (LLM) extracts structured commitment                                │
│ - domain: "fitness"                                                          │
│ - target: {type: "count", value: 3, unit: "sessions"}                        │
│ - schedule: {type: "weekly", windows: [{day: "mon", start_minute: 360}]}       │
│                                                                              │
│ ↓                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ STEP 2: COMMITMENT CONFIRMATION                                              │
│ Location: Client — Commitment builder modal                                  │
│                                                                              │
│ User reviews, adjusts windows, confirms                                      │
│                                                                              │
│ ↓                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ STEP 3: COMMITMENT STORAGE                                                   │
│                                                                              │
│ ┌────────────────────────────────┐    ┌────────────────────────────────────┐  │
│ │ Server: commitments table      │    │ Client: IndexedDB (encrypted)      │  │
│ │ • id, user_id                  │    │ • commitment_id                    │  │
│ │ • commitment_code: "habit"     │    │ • description_encrypted            │  │
│ │ • target_type: "count"         │    │ • motivation_encrypted             │  │
│ │ • target_value: 3              │    │ • personal_notes_encrypted         │  │
│ │ • cadence: "weekly"            │    │ • schedule_windows_human           │  │
│ │ • schedule_windows: [...]        │    │                                    │  │
│ │ • status: "active"               │    │                                    │  │
│ └────────────────────────────────┘    └────────────────────────────────────┘  │
│                                                                              │
│ Event logged:                                                                │
│ behaviour_events: {event_type: "commitment_created", ...}                    │
│                                                                              │
│ ↓                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ STEP 4: TRIGGER EVALUATION (Continuous)                                      │
│ Location: Client — TriggerEvaluator (60s interval)                            │
│                                                                              │
│ Every minute (when app foreground):                                         │
│ - Load active commitments from server                                        │
│ - Check if "now" falls in any commitment window                              │
│ - Check guardrails (max/day, quiet hours, cooldown)                          │
│ - Check if outcome already logged for this window                            │
│                                                                              │
│ If trigger fires:                                                            │
│ Event logged (local queue, sync when online):                                │
│ behaviour_events: {event_type: "trigger_fired",                               │
│                      subject_code: "fitness",                                │
│                      metadata: {trigger_type: "window_open"}}                 │
│                                                                              │
│ ↓                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ STEP 5: NUDGE SURFACE                                                        │
│ Location: Client — Inbox / Push (if permitted)                              │
│                                                                              │
│ Inbox item created (local):                                                  │
│ - template_code: "fitness_morning"                                           │
│ - commitment_id                                                              │
│ - actions: ["start", "snooze_10", "skip", "reschedule"]                       │
│                                                                              │
│ User taps "start" or "complete"                                              │
│                                                                              │
│ ↓                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ STEP 6: OUTCOME LOGGING                                                      │
│ Location: Client → Server sync                                               │
│                                                                              │
│ Outcome event logged:                                                        │
│ behaviour_events: {event_type: "commitment_outcome_logged",                   │
│                      subject_code: "fitness",                                │
│                      outcome_code: "completed",                                │
│                      commitment_id: "uuid",                                    │
│                      metadata: {window_start, window_end}}                    │
│                                                                              │
│ Server validates via safeSupabaseWrite.ts (metadata-only)                    │
│                                                                              │
│ ↓                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ STEP 7: GOVERNANCE RECOMPUTE (Daily cron)                                    │
│ Location: Server — /api/internal/governance/daily                            │
│                                                                              │
│ stateEngine.ts recomputes:                                                   │
│ - discipline_state (from commitment completion rate)                         │
│ - governance_risk_score (from skip patterns)                                 │
│                                                                              │
│ Updates governance_state table                                               │
│                                                                              │
│ ↓                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ STEP 8: DRIFT DETECTION (Weekly)                                             │
│ Location: Client — Weekly review trigger                                      │
│                                                                              │
│ Query outcomes for past 7 days:                                              │
│ - completed_count / total_windows = completion_rate                          │
│ - skip_count / total_outcomes = skip_ratio                                   │
│ - consecutive_missed_windows >= 2 ? drift_detected                           │
│                                                                              │
│ If drift:                                                                    │
│ Event logged:                                                                │
│ behaviour_events: {event_type: "drift_detected",                              │
│                      subject_code: "fitness",                                │
│                      metadata: {drift_type: "missed_streak", severity: 2}}     │
│                                                                              │
│ ↓                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ STEP 9: ADAPTATION RULE                                                      │
│ Location: Client — AdaptationEngine (deterministic)                           │
│                                                                              │
│ Rule: IF drift_detected AND skip_ratio > 0.6 THEN                            │
│   - Suggest cadence reduction OR                                             │
│   - Suggest schedule window adjustment                                       │
│                                                                              │
│ No automatic changes — user confirmation required                              │
│ Proposal logged as event (not commitment change)                             │
│ behaviour_events: {event_type: "adaptation_proposed", ...}                     │
│                                                                              │
│ ↓                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ STEP 10: WEEKLY IDENTITY SYNTHESIS                                           │
│ Location: Server — AI Layer (read-only)                                       │
│                                                                              │
│ AI reads:                                                                    │
│ - governance_state (discipline_state, focus_state)                           │
│ - Outcome tallies (from events)                                              │
│ - Drift events                                                               │
│                                                                              │
│ Generates weekly reflection (local, ephemeral)                               │
│ No state change — purely conversational                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Storage Mapping Matrix

| Data | Server (Supabase) | Client (IndexedDB) | Encryption |
|------|-------------------|-------------------|------------|
| Commitment metadata | `commitments` table | Cache (unencrypted) | No |
| Commitment description | NOT STORED | `commitments_local.description` | AES-256-GCM |
| Schedule windows | `commitments.schedule_windows` (JSON) | Human-readable version | No |
| Trigger definitions | Computed (not stored) | Cached evaluated state | No |
| Outcome events | `behaviour_events` (metadata) | Full outcome log | No |
| Nudge templates | NOT STORED | `nudge_templates` store | No (not sensitive) |
| Inbox items | NOT STORED | `inbox_items` store | Local-only |
| Guardrail config | `user_preferences.orchestration_prefs` (JSON) | Mirror | No |
| Drift calculations | Event logs only | Computed on read | No |

---

## 3️⃣ Minimal Schema Changes Required

### 3.1 What MUST Change (Additions Only)

#### 1. `commitments` table extensions
```
Existing: id, user_id, commitment_code, subject_code, target_type, 
          target_value, start_at, end_at, status

NEW COLUMNS (metadata-only):
• cadence: varchar(20) -- 'daily', 'weekly', 'custom'
• schedule_windows: jsonb -- [{day_of_week: 1, start_minute: 360, end_minute: 480}]
• timezone: varchar(50) -- 'America/New_York'
• escalation_policy: jsonb -- {miss_threshold: 2, escalate_to: 'review'}

RATIONALE: All JSON content is structured config (not free-text).
All strings are enum values (validated in validation.ts).
```

#### 2. New `orchestration_preferences` column
```
Existing: user_preferences table

NEW COLUMN:
• orchestration_prefs: jsonb -- {
    max_nudges_per_day: 5,
    quiet_hours_start: 1320,  -- 22:00 in minutes
    quiet_hours_end: 480,     -- 08:00 in minutes
    domain_toggles: {
      sleep: 2,  -- 0=off, 1=inbox, 2=push
      focus: 2,
      fitness: 1,
      ...
    }
  }

RATIONALE: User's schedule preferences are not sensitive content.
Domain toggles are integer codes (not free-text).
```

#### 3. New event types in `GOVERNANCE_EVENT_TYPES`
```
Existing: commitment_created, commitment_completed, commitment_violation, ...

NEW TYPES:
• 'commitment_outcome_logged'   -- completion, skip, miss
• 'trigger_fired'               -- temporal trigger activated
• 'trigger_suppressed'          -- guardrail blocked trigger
• 'drift_detected'              -- pattern indicates commitment drift
• 'adaptation_proposed'         -- system suggests change
• 'guardrail_enforced'          -- cap/hours/cooldown triggered

RATIONALE: Event type expansion doesn't change table schema.
Just adds to validation.ts enum.
```

### 3.2 What Should NOT Be Created

| Proposal | Reason to Reject |
|----------|------------------|
| `orchestration_state` table | Duplicate of governance_state — derive from events instead |
| `triggers` table | Triggers should be computed from commitment + wall-clock, not stored |
| `nudges` table (unblocked) | Currently write-blocked for privacy — keep blocked, use local inbox |
| `execution_log` table | behaviour_events already exists — don't duplicate |
| `outcomes` table separate from events | Outcomes are events — append to behaviour_events |
| `drift_state` table | Drift is derived metric — compute from events on read |

### 3.3 Computed vs Stored Decision Matrix

| Concept | Decision | Rationale |
|---------|----------|-----------|
| Trigger state | **Computed** | Trigger = f(commitment.schedule_windows, now, last_outcome) |
| Drift score | **Computed** | Drift = f(outcome_events, 7d window) |
| Escalation level | **Derived from governance** | governance_state.escalation_level already exists |
| Completion rate | **Computed** | Rate = f(outcome_events, commitment_id, time_window) |
| Next window | **Computed** | From schedule_windows + timezone + now |
| Cadence | **Stored** | User-defined config in commitments.cadence |

---

## 4️⃣ Execution State Machine Model

### 4.1 Commitment Lifecycle States

```
                         ┌─────────────────┐
                         │     DRAFT     │  (local only, pre-confirmation)
                         └────────┬────────┘
                                  │ User confirms
                                  ▼
┌──────────────┐        ┌─────────────────┐
│   PAUSED     │◄───────│     ACTIVE      │
│  (on ice)    │        │  (evaluating)   │
└──────┬───────┘        └────────┬────────┘
       │                         │
       │ User resumes            │ Window open
       │                         ▼
       │                ┌─────────────────┐
       │                │  WINDOW_OPEN    │
       │                │ (trigger armed) │
       │                └────────┬────────┘
       │                         │ Guardrails pass
       │                         ▼
       │                ┌─────────────────┐
       │                │   NUDGE_SENT    │
       │                │ (surface fired) │
       │                └────────┬────────┘
       │                         │ User action
       │              ┌──────────┼──────────┐
       │              ▼          ▼          ▼
       │    ┌─────────────┐ ┌────────┐ ┌──────────┐
       │    │  COMPLETED  │ │ SKIPPED│ │ SNOOZED  │
       │    │   (done)    │ │(opt-out)│ │(delayed) │
       │    └──────┬──────┘ └────┬───┘ └────┬─────┘
       │           │             │          │
       │           │             │          └────┐
       │           │             │               │ (reschedules)
       │           │             ▼               │
       │           │    ┌─────────────────┐      │
       │           │    │  DRIFT_DETECTED │◄─────┘ (if snooze→skip)
       │           │    │  (pattern flag) │
       │           │    └────────┬────────┘
       │           │             │ Auto/Manual
       │           │             ▼
       │           │    ┌─────────────────┐
       │           └──►│    ABANDONED    │
       │               │  (terminated)   │
       │               └─────────────────┘
       │
       └─────────────────┐
                         ▼
                ┌─────────────────┐
                │   ESCALATED     │  (governance-driven)
                │  (high risk)    │
                └─────────────────┘
```

### 4.2 Valid State Transitions

| From | To | Trigger | Event Logged |
|------|-----|---------|--------------|
| DRAFT | ACTIVE | User confirms | `commitment_created` |
| ACTIVE | WINDOW_OPEN | Wall-clock enters window | (internal, no event) |
| WINDOW_OPEN | NUDGE_SENT | Guardrails pass | `trigger_fired` |
| NUDGE_SENT | COMPLETED | User marks done | `commitment_outcome_logged` (completed) |
| NUDGE_SENT | SKIPPED | User skips | `commitment_outcome_logged` (skipped) |
| NUDGE_SENT | SNOOZED | User snoozes | `commitment_outcome_logged` (snoozed) |
| SNOOZED | WINDOW_OPEN | Snooze expires | (internal) |
| SNOOZED | SKIPPED | User skips after snooze | `commitment_outcome_logged` (skipped) |
| SKIPPED | DRIFT_DETECTED | Skip ratio > threshold | `drift_detected` |
| ACTIVE | PAUSED | User pauses | `commitment_status_changed` (paused) |
| PAUSED | ACTIVE | User resumes | `commitment_status_changed` (active) |
| ANY | ABANDONED | User abandons OR auto-abandon after 30d drift | `commitment_status_changed` (abandoned) |
| ACTIVE | ESCALATED | governance_state.escalation_level > 2 | `escalation_triggered` |

### 4.3 Transitions That Modify governance_state

**Only these state changes trigger governance recomputation:**

1. `commitment_created` → affects discipline_state baseline
2. `commitment_outcome_logged` (completed/skipped/missed) → affects discipline_state
3. `drift_detected` → affects governance_risk_score
4. `commitment_status_changed` → affects discipline_state calculation window

**All other transitions are client-side only** (nudge_sent, snoozed, window_open).

**Evidence:** `lib/governance/stateEngine.ts:50-60` shows stateEngine reads `behaviour_events` and `commitments` — not internal Execution Spine state.

---

## 5️⃣ Drift Detection Logic

### 5.1 Drift Types & Detection Rules

| Drift Type | Detection Rule | Severity |
|------------|----------------|----------|
| **Missed Window Streak** | `consecutive_missed_windows >= 2` | 1 (warning) |
| **Skip Ratio Elevated** | `skips / (completed + skipped) > 0.6` over 7d | 2 (elevated) |
| **Silence Post-Creation** | No outcomes logged within 48h of commitment creation | 1 (warning) |
| **Schedule Conflict** | 3+ snoozes followed by skip in same window | 2 (elevated) |
| **Engagement Drop** | `nudges_sent / nudges_actioned < 0.3` over 14d | 3 (critical) |
| **Weekend Falloff** | 80%+ completion on weekdays, 0% on weekends (if scheduled) | 1 (warning) |

### 5.2 Where Drift Should Be Computed

**Decision: COMPUTE AT READ-TIME, STORE AS EVENT WHEN THRESHOLD CROSSED**

Rationale:
- Drift is a **metric**, not a state
- Computing at read-time allows changing thresholds without migration
- Event log captures "drift detected" moment for governance
- No need for `drift_state` table (would duplicate events)

**Algorithm (deterministic):**
```
function detectDrift(commitmentId, lookbackDays = 7):
  outcomes = query behaviour_events where
    commitment_id = commitmentId AND
    event_type = 'commitment_outcome_logged' AND
    occurred_at > now() - lookbackDays

  total = outcomes.length
  completed = count where outcome_code = 'completed'
  skipped = count where outcome_code = 'skipped'
  
  if total == 0:
    if commitment_created_at < now() - 48h:
      return {drift: true, type: 'silence_post_creation', severity: 1}
    return {drift: false}
  
  skip_ratio = skipped / total
  if skip_ratio > 0.6:
    return {drift: true, type: 'skip_ratio_elevated', severity: 2}
  
  // Check consecutive misses
  sorted = outcomes.sort by window_start desc
  consecutive_misses = 0
  for outcome in sorted:
    if outcome.outcome_code == 'missed':
      consecutive_misses++
    else:
      break
  if consecutive_misses >= 2:
    return {drift: true, type: 'missed_streak', severity: 1}
  
  return {drift: false}
```

### 5.3 Drift Event Structure

```typescript
// Logged to behaviour_events when drift detected
{
  event_type: "drift_detected",
  user_id: "uuid",
  subject_code: "fitness",           // Domain code
  commitment_id: "uuid",
  metadata: {
    drift_type: "skip_ratio_elevated", // enum
    severity: 2,                       // 1-3
    threshold: 0.6,                      // What threshold was crossed
    actual_value: 0.75,                  // Measured value
    lookback_days: 7,
    window_count: 6,                     // Total windows in lookback
    outcome_counts: {completed: 2, skipped: 4, missed: 0}
  }
}
```

### 5.4 Tradeoff Analysis

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Compute at read** (chosen) | No schema change; threshold changes instant; replayable | Slightly more query load | ✅ USE |
| **Store drift_state table** | Fast reads; pre-computed | Schema bloat; sync issues; stale data | ❌ REJECT |
| **Drift flag in commitments** | Simple read | Violates append-only; loses history | ❌ REJECT |

---

## 6️⃣ Guardrail Model

### 6.1 Guardrail Types

| Guardrail | Enforcement Point | Config Location |
|-----------|-------------------|-----------------|
| **Max nudges per day** | Trigger evaluator | `user_preferences.orchestration_prefs.max_nudges_per_day` |
| **Cooldown between nudges** | Trigger evaluator | `user_preferences.orchestration_prefs.cooldown_minutes` |
| **Quiet hours** | Trigger evaluator | `user_preferences.orchestration_prefs.quiet_hours_start/end` |
| **Max snoozes per window** | Outcome handler | `commitments.escalation_policy.max_snoozes` |
| **Auto-pause threshold** | Weekly drift check | `user_preferences.orchestration_prefs.auto_pause_after_skips` |
| **Surface preference per domain** | Trigger evaluator | `user_preferences.orchestration_prefs.domain_toggles[domain]` |

### 6.2 Guardrail Enforcement Logic

```
function canFireTrigger(commitment, guardrailConfig, todayStats):
  // 1. Max per day
  if todayStats.nudges_sent >= guardrailConfig.max_nudges_per_day:
    logEvent('trigger_suppressed', {reason: 'daily_cap', commitment_id: commitment.id})
    return false
  
  // 2. Quiet hours
  now_minute = current_minute_of_day()
  if guardrailConfig.quiet_hours_start < guardrailConfig.quiet_hours_end:
    // Normal range (e.g., 22:00-08:00)
    if now_minute >= guardrailConfig.quiet_hours_start && 
       now_minute <= guardrailConfig.quiet_hours_end:
      logEvent('trigger_suppressed', {reason: 'quiet_hours'})
      return false
  else:
    // Wrapped range (e.g., 22:00-06:00 crosses midnight)
    if now_minute >= guardrailConfig.quiet_hours_start || 
       now_minute <= guardrailConfig.quiet_hours_end:
      logEvent('trigger_suppressed', {reason: 'quiet_hours'})
      return false
  
  // 3. Cooldown
  if todayStats.last_nudge_at:
    minutes_since = (now() - todayStats.last_nudge_at) / 60000
    if minutes_since < guardrailConfig.cooldown_minutes:
      logEvent('trigger_suppressed', {reason: 'cooldown'})
      return false
  
  // 4. Domain toggle
  if guardrailConfig.domain_toggles[commitment.domain] == 0:
    logEvent('trigger_suppressed', {reason: 'domain_disabled'})
    return false
  
  return true
```

### 6.3 Configuration Schema (JSONB)

```typescript
// Stored in user_preferences.orchestration_prefs
interface OrchestrationPreferences {
  version: 1;
  
  // Global caps
  max_nudges_per_day: number;      // default: 5, min: 1, max: 20
  cooldown_minutes: number;        // default: 30, min: 5
  
  // Quiet hours (minutes from midnight, 0-1439)
  quiet_hours: {
    enabled: boolean;
    start_minute: number;          // default: 1320 (22:00)
    end_minute: number;            // default: 480 (08:00)
  };
  
  // Per-domain surface preference (0=off, 1=inbox-only, 2=push-allowed)
  domains: {
    sleep: 0 | 1 | 2;
    focus: 0 | 1 | 2;
    routine: 0 | 1 | 2;
    abstinence: 0 | 1 | 2;
    fitness: 0 | 1 | 2;
    social: 0 | 1 | 2;
  };
  
  // Auto-pause rules
  auto_pause: {
    enabled: boolean;
    skip_threshold: number;        // Skip ratio that triggers pause suggestion
    consecutive_misses: number;    // Misses that trigger auto-pause
  };
}
```

**Validation:** All values are numbers or booleans. No free-text. Enforced by `safeSupabaseWrite.ts`.

---

## 7️⃣ Risk & Integrity Analysis

### 7.1 Engine Bloat Risks

| Risk Area | Symptom | Prevention |
|-----------|---------|------------|
| **Trigger explosion** | Too many trigger types | Limit to 3: window_open, deviation_based, inactivity_based |
| **Event type proliferation** | 50+ event types | Require PR review for new types; consolidate similar |
| **Adaptation complexity** | ML-based rules creeping in | Explicit: "No ML in Phase 2"; all rules deterministic |
| **Cross-domain coupling** | Sleep trigger depends on Focus state | Each commitment evaluates independently; no cross-references |
| **Governance creep** | stateEngine imports Execution | Code review check: governance/ must not import execution/ |

### 7.2 Duplication Risks

| Potential Duplication | Why It's Tempting | Why We Reject |
|----------------------|-------------------|---------------|
| `orchestration_events` table separate from `behaviour_events` | "Events are different" | behaviour_events is append-only, typed, indexed — reuse it |
| `outcomes` table for fast queries | "Querying events is slow" | Add index on (user_id, event_type, commitment_id); don't duplicate |
| `next_trigger_at` column on commitments | "Fast trigger lookup" | Compute from schedule_windows; wall-clock is source of truth |
| `streak_count` column | "Show streak in UI" | Compute from outcome events; storing creates sync bug |
| `completion_rate` column | "Dashboard needs it" | Computed metric; cache client-side if needed |

### 7.3 Circular Dependency Risks

**Forbidden dependency graph:**

```
❌ GOVERNANCE → EXECUTION (governance imports execution)
❌ EXECUTION → AI → GOVERNANCE (AI layer must not write governance)
❌ EXECUTION → GOVERNANCE_STATE (must read via readState.ts only)
```

**Enforcement:**
- CI check: `grep -r "from '@/lib/execution'" lib/governance/` must return empty
- Code review: Any Execution import in governance/ is blocking comment

### 7.4 What NOT to Build Yet

| Feature | Temptation | Why Delay |
|---------|------------|-----------|
| **Calendar integration** | "Auto-block time" | Requires OAuth, write scopes, conflict detection — high complexity for MVP |
| **Smart notifications** | "AI-optimized timing" | Non-deterministic; creepiness risk; hard to debug |
| **Cross-device sync** | "Phone nudge, watch complete" | Requires complex state merging; risk of double-completion |
| **Social accountability** | "Share with friend" | Privacy risk; requires new sharing infra |
| **Gamification** | "Streaks, badges, points" | Distracts from core commitment loop; can add later |
| **Widget** | "Quick-complete from home screen" | Platform-specific; defer to Phase 2.6 |
| **Wearable integration** | "Auto-detect workout" | Data privacy concerns; requires health kit permissions |

### 7.5 Red Flags (Watch For)

**During implementation, reject any proposal that:**

1. Adds a new table when behaviour_events could suffice
2. Stores computed values on server (streak, rate, drift score)
3. Requires governance_state write from Execution layer
4. Uses free-text fields for configuration (use enum codes)
5. Creates bidirectional dependency between Execution and Governance
6. Introduces non-deterministic trigger timing ("AI decides when")
7. Stores PII in Supabase (description, motivation, notes)
8. Bypasses safeSupabaseWrite.ts for any write

---

## Appendix: Event Type Registry (Proposed)

| Event Type | Layer | Purpose | Metadata Schema |
|------------|-------|---------|-----------------|
| `commitment_created` | Execution → Governance | New commitment | `{cadence, target_type, target_value}` |
| `commitment_outcome_logged` | Execution → Governance | Completion/skip/miss | `{outcome_code, window_start, window_end}` |
| `commitment_status_changed` | Execution → Governance | Pause/resume/abandon | `{old_status, new_status, reason_code}` |
| `trigger_fired` | Execution → Governance | Trigger activated | `{trigger_type, window_id}` |
| `trigger_suppressed` | Execution → Governance | Guardrail blocked | `{reason_code: 'daily_cap' \| 'quiet_hours' \| 'cooldown'}` |
| `drift_detected` | Execution → Governance | Pattern alert | `{drift_type, severity, threshold, actual}` |
| `adaptation_proposed` | Execution → Governance | Suggested change | `{proposed_change: json, reason}` |
| `adaptation_accepted` | Execution → Governance | User confirmed | `{change_applied: json}` |
| `guardrail_enforced` | Execution → Governance | Auto-pause, etc. | `{guardrail_type, action_taken}` |

---

**END OF ARCHITECTURE PLAN**

*All design decisions backed by current repo structure. No code written. No migrations created.*
