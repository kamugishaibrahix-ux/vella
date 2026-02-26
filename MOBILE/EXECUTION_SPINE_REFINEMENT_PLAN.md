# Execution Spine Refinement Plan

**Status:** Structural Redesign Phase  
**Scope:** Correcting architectural weaknesses before build  
**Constraint:** NO CODE, NO MIGRATIONS, NO UI  
**Date:** 2026-02-24  

---

## Executive Summary

### Weaknesses Being Corrected

| Weakness | Correction |
|----------|------------|
| Escalation depends on governance_state timing | Escalation derived purely from event patterns; governance reflects it later |
| Commitment schema biased toward recurring habits | Generalised to three types: recurring, deadline, milestone |
| State machine mixing concerns | Separated into 4 orthogonal dimensions: lifecycle, window, nudge, drift |
| Trigger evaluator client-bound | Redesigned as pure deterministic function; portable to server/cron |
| No formal extraction layer | Defined Commitment Extraction Engine with confidence thresholds |
| Risk of enum explosion | Established Event Type Governance policy with strict rules |

### Core Architectural Shift

**Previous:** `Execution → behaviour_events → Governance → (read state) → Execution`

**Refined:** `Execution → behaviour_events → (independent read) → Governance`

Escalation is now an **Execution-layer determination** based on raw event history, not governance_state. Governance reflects escalation for informational purposes only — it does not drive it.

---

## 1️⃣ Escalation Decoupling Strategy

### 1.1 Decision: Escalation Depends on Raw Event Patterns (B)

**Rationale:**
- governance_state is **computed, cached, cron-dependent** — using it creates timing races
- Raw events are **append-only, immutable, wall-clock independent** — replayable deterministically
- Escalation is an **action trigger**, not a **state description** — it belongs in Execution

### 1.2 Revised Escalation Logic Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ESCALATION EVALUATION (Execution Layer)                                       │
│                                                                              │
│ Input:                                                                       │
│ • commitment_id                                                              │
│ • event_history (behaviour_events for this commitment, 30d window)           │
│ • escalation_policy (stored in commitment.escalation_policy JSON)            │
│                                                                              │
│ Logic (deterministic, pure function):                                        │
│                                                                              │
│ function evaluateEscalation(events, policy):                                 │
│   outcomes = events.filter(e => e.event_type === 'commitment_outcome_logged')│
│   total_windows = countWindows(policy, 7d)                                   │
│   completed = outcomes.filter(o => o.outcome_code === 'completed').length    │
│   missed = total_windows - completed                                         │
│                                                                              │
│   // Level 1: Missed streak                                                  │
│   if consecutiveMisses(events) >= policy.miss_threshold_1:                   │
│     return {level: 1, trigger: 'missed_streak', action: 'nudge_intensified'} │
│                                                                              │
│   // Level 2: Completion rate critical                                       │
│   if completed / total_windows < policy.completion_threshold_2:                │
│     return {level: 2, trigger: 'rate_critical', action: 'suggest_pause'}   │
│                                                                              │
│   // Level 3: Abandonment risk                                               │
│   if daysSinceLastOutcome(events) > policy.silence_threshold_3:              │
│     return {level: 3, trigger: 'silence_risk', action: 'propose_abandon'}    │
│                                                                              │
│   return {level: 0} // No escalation                                          │
│                                                                              │
│ Output: EscalationDecision (declarative, no side effects)                    │
└──────────────────────┬───────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ EVENT LOGGING (Externalised Side Effect)                                     │
│                                                                              │
│ IF escalation_decision.level > 0:                                            │
│   logEvent({                                                                 │
│     event_type: 'escalation_triggered',                                      │
│     subject_code: commitment.subject_code,                                   │
│     commitment_id: commitment.id,                                            │
│     metadata: {                                                                │
│       escalation_level: decision.level,                                        │
│       trigger_pattern: decision.trigger,                                     │
│       action_proposed: decision.action,                                      │
│       event_counts: {completed, missed, total},                                │
│       computed_at: timestamp                                                 │
│     }                                                                          │
│   })                                                                           │
│                                                                              │
│ NOTE: Event logged BEFORE any action taken. Action executed by separate      │
│ handler to maintain purity.                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Where Escalation Is Computed

| Context | Location | Trigger |
|---------|----------|---------|
| **Foreground** | Client — during trigger evaluation cycle | Every 60s, or when user opens app |
| **Background** | Server cron — `/api/internal/execution/escalation` | Daily, for all active commitments |
| **On-demand** | Client — when user views commitment detail | Compute and cache for 5 minutes |

**Key:** All three use **identical function** `evaluateEscalation()` — pure, deterministic, same inputs → same outputs.

### 1.4 How Governance Reflects Escalation

```
Governance Layer (stateEngine.ts):

function computeGovernanceState(userId):
  events = loadEvents(userId, 30d)
  escalation_events = events.filter(e => e.event_type === 'escalation_triggered')
  
  // Reflect escalation in governance_state for AI layer context
  current_escalation = escalation_events
    .sort by occurred_at desc
    .find(e => e.occurred_at > now() - 7d) // Recent only
  
  governance_state.escalation_summary = {
    current_level: current_escalation?.metadata.escalation_level || 0,
    last_triggered_at: current_escalation?.occurred_at || null,
    recent_count_7d: escalation_events.filter(e => e.occurred_at > now() - 7d).length
  }
  
  // governance_state reflects escalation; it does not drive it
```

### 1.5 Circular Dependency Elimination

**Forbidden:**
- ❌ Execution queries `governance_state` table
- ❌ Execution uses `governance_state.escalation_level` to decide actions
- ❌ Governance writes to commitment status

**Required:**
- ✅ Execution evaluates escalation from raw events
- ✅ Execution logs `escalation_triggered` event
- ✅ Governance reads events to reflect escalation
- ✅ Status changes (abandoned, paused) logged by Execution as separate events

---

## 2️⃣ Commitment Model Generalisation

### 2.1 Unified Schema Supporting Three Types

```
commitments table (metadata-only additions):

┌─────────────────────────────────────────────────────────────────────────────┐
│ EXISTING COLUMNS                                                            │
│ • id, user_id, commitment_code, subject_code, target_type, target_value     │
│ • status (active, paused, completed, abandoned)                           │
│ • start_at, end_at (nullable)                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ NEW COLUMNS (generalised)                                                   │
│                                                                             │
│ cadence_type: varchar(20)                                                   │
│   - 'recurring'  → Habit (e.g., "exercise 3x/week")                         │
│   - 'deadline'   → One-off (e.g., "submit report by Friday")               │
│   - 'milestone'  → Multi-step (e.g., "launch website: design, build, ship")   │
│                                                                             │
│ target_type: varchar(20) (expanded)                                          │
│   - 'count'      → N completions (recurring)                                │
│   - 'duration'   → Minutes/hours (recurring)                                │
│   - 'boolean'    → Did/didn't (recurring)                                   │
│   - 'completion' → 0/1 (deadline)                                         │
│   - 'milestone'→ % progress (milestone)                                   │
│                                                                             │
│ deadline_at: timestamp (nullable)                                           │
│   - Used when cadence_type = 'deadline'                                     │
│   - NULL for recurring and milestone                                        │
│                                                                             │
│ recurrence_rules: jsonb (nullable)                                         │
│   - Used when cadence_type = 'recurring'                                    │
│   - {frequency, interval, days_of_week, time_windows}                       │
│   - Example: {frequency: 'weekly', interval: 1, days_of_week: [1,3,5],      │
│               time_windows: [{start: 360, end: 480}]}                        │
│                                                                             │
│ milestone_structure: jsonb (nullable)                                        │
│   - Used when cadence_type = 'milestone'                                    │
│   - [{milestone_id, order, weight_pct, target_type, target_value}]        │
│   - Example: [{id: 'design', order: 1, weight: 30, target: 'completion'},│
│               {id: 'build', order: 2, weight: 50, target: 'completion'},    │
│               {id: 'ship', order: 3, weight: 20, target: 'completion'}]     │
│                                                                             │
│ escalation_policy: jsonb (unified)                                         │
│   - All types use same policy structure                                     │
│   - {miss_threshold, completion_threshold, silence_threshold, actions}    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Type-Specific Trigger Evaluation

#### Recurring Type

```
Window Generation:
  Generate windows for next 7 days based on recurrence_rules
  Each window: {start_at, end_at, window_id}

Trigger Logic:
  IF now in window AND no outcome logged for this window:
    IF guardrails pass:
      RETURN {action: 'nudge', window_id, intensity: normal}

Outcome Logging:
  event: 'commitment_outcome_logged'
  metadata: {outcome_code: 'completed'|'skipped'|'missed', window_id}

Drift Detection:
  miss_streak = consecutive windows with outcome_code='missed'
  skip_ratio = skipped / (completed + skipped) over 7d
```

#### Deadline Type

```
Window Generation:
  Single window: {start_at: deadline_at - 24h, end_at: deadline_at}
  (Or user-defined: start_at, end_at stored directly)

Trigger Logic:
  IF now in [deadline_at - 24h, deadline_at]:
    IF no outcome logged for this deadline:
      time_to_deadline = deadline_at - now
      IF time_to_deadline < 4h: intensity = 'urgent'
      ELSE IF time_to_deadline < 24h: intensity = 'normal'
      RETURN {action: 'nudge', intensity}

Outcome Logging:
  event: 'commitment_outcome_logged'
  metadata: {outcome_code: 'completed'|'incomplete', deadline_at}

Drift Detection:
  IF now > deadline_at AND no outcome logged:
    outcome = 'missed' (auto-logged by system)
    drift = 'deadline_missed'
```

#### Milestone Type

```
Window Generation:
  Current milestone = first incomplete milestone in order
  Window = {start_at: now, end_at: null} (continuous)

Trigger Logic:
  current = getCurrentMilestone()
  IF current:
    IF daysSinceLastProgress(current) > 2:
      RETURN {action: 'nudge', milestone_id: current.id}

Outcome Logging:
  event: 'milestone_progress_logged'
  metadata: {milestone_id, progress_pct, status: 'in_progress'|'complete'}

  When milestone complete:
  event: 'commitment_outcome_logged'
  metadata: {outcome_code: 'milestone_completed', milestone_id}

Drift Detection:
  stalled_milestones = milestones with no progress in 7d
  IF stalled_milestones.length > 0:
    drift = 'milestone_stalled'
  IF all milestones complete:
    commitment.status = 'completed' (event logged)
```

### 2.3 Type-Specific Drift Computation

```
function detectDrift(commitment, events):
  switch commitment.cadence_type:
    
    case 'recurring':
      windows = generateWindows(commitment, 7d)
      outcomes = events.filter(e => e.event_type === 'commitment_outcome_logged')
      miss_streak = countConsecutiveMisses(outcomes, windows)
      skip_ratio = calculateSkipRatio(outcomes)
      return {drift: miss_streak >= 2 || skip_ratio > 0.6, type: 'pattern'}
    
    case 'deadline':
      deadline = commitment.deadline_at
      outcome = events.find(e => e.event_type === 'commitment_outcome_logged')
      if !outcome && now > deadline:
        return {drift: true, type: 'deadline_missed'}
      if outcome && outcome.metadata.outcome_code === 'incomplete':
        return {drift: true, type: 'deadline_incomplete'}
      return {drift: false}
    
    case 'milestone':
      milestones = commitment.milestone_structure
      progress_events = events.filter(e => e.event_type === 'milestone_progress_logged')
      stalled = milestones.filter(m => {
        last_progress = progress_events.filter(e => e.metadata.milestone_id === m.id)
                  .sort by occurred_at desc
                  .first()
        return !last_progress || daysSince(last_progress.occurred_at) > 7
      })
      return {drift: stalled.length > 0, type: 'milestone_stalled', stalled_count: stalled.length}
```

### 2.4 What NOT to Support Yet

| Feature | Why Deferred |
|---------|--------------|
| **Nested milestones** (milestones within milestones) | Complexity; flat structure sufficient for 90% of use cases |
| **Dependency chains** (milestone B depends on A) | Over-engineering; user can sequence via milestone_structure order |
| **Floating deadlines** ("complete within 3 days of starting") | Hard to evaluate deterministically; fixed deadlines only |
| **Collaborative commitments** (multiple users) | Requires permissions, sync, conflict resolution — defer to Phase 3 |
| **Location-based triggers** | Requires geolocation permissions, privacy risk |
| **Smart rescheduling** (AI finds "optimal" time) | Non-deterministic, creepiness risk |

---

## 3️⃣ State Dimension Separation

### 3.1 Four Orthogonal State Dimensions

#### Dimension A: Commitment Lifecycle State

**Purpose:** Long-term state of the commitment entity

```
States:
  draft       → Not yet confirmed (local only)
  active      → Confirmed, evaluating
  paused      → Temporarily suspended (user-initiated)
  completed   → All targets achieved (terminal)
  abandoned   → Explicitly terminated (terminal)

Storage:
  commitments.status column (server)
  
Transitions logged:
  draft → active        : event 'commitment_created'
  active ↔ paused       : event 'commitment_status_changed'
  active → completed    : event 'commitment_status_changed' (auto or manual)
  any → abandoned       : event 'commitment_status_changed'

Immutability:
  Once completed or abandoned, no further transitions allowed
  New commitment must be created if user wants to retry
```

#### Dimension B: Window Evaluation State

**Purpose:** Temporal state of current evaluation cycle

```
States:
  idle          → No window open, waiting
  window_open   → Within a commitment window
  nudge_sent    → Nudge fired, awaiting outcome
  snoozed       → Nudge deferred, timer active

Storage:
  NOT STORED (computed)
  
Computation:
  window_open   = f(commitment.schedule, now)
  nudge_sent    = f(window_open, !outcome_logged, guardrails_pass)
  snoozed       = f(nudge_sent, snooze_expiry > now)

Transitions:
  These are internal to trigger evaluator
  No events logged for window state changes
  Only outcomes (completed, skipped) are logged as events

Important:
  Window state is ephemeral — app restart recalculates
  No recovery needed if client crashes mid-window
```

#### Dimension C: Nudge State

**Purpose:** State of proactive surface for current window

```
States:
  not_sent      → Not yet triggered
  sent_pending  → Nudge delivered, awaiting action
  acknowledged  → User interacted (any action)
  expired       → Window closed without action

Storage:
  NOT STORED in Supabase
  Local-only in IndexedDB (nudge_queue, inbox_items)
  
Rationale:
  Nudges are ephemeral UI state
  Reconstructible from: window state + outcome events
  If client loses nudge_queue, recalculate from events

Event logging:
  NO events for nudge state changes
  Events only for user actions (outcome_logged)
  
Exception:
  'trigger_suppressed' logged when guardrail blocks
```

#### Dimension D: Drift Classification State

**Purpose:** Computed classification of commitment health

```
Classifications:
  healthy       → On track, no action needed
  warning       → Early indicators (1 missed window)
  drifting      → Pattern established (miss streak or high skip ratio)
  critical      → At risk of abandonment (silence, extreme skip ratio)

Storage:
  NOT STORED as state
  Computed at read-time from event history
  
Event logging:
  When classification changes (threshold crossed):
    event: 'drift_detected' or 'drift_resolved'
  
Frequency:
  Computed:
    - Every trigger evaluation (lightweight)
    - Weekly review (comprehensive)
    - On-demand when user views commitment

Immutability:
  Classification is not state — it's a metric
  Yesterday's "drifting" doesn't prevent today's "healthy"
  Re-evaluated fresh each time
```

### 3.2 State Storage Decision Matrix

| Dimension | Stored | Location | Computed | Events |
|-----------|--------|----------|----------|--------|
| Lifecycle | ✅ Yes | `commitments.status` | ❌ No | Status changes |
| Window | ❌ No | — | ✅ Yes | None |
| Nudge | ❌ No | IndexedDB (local) | ✅ Yes | None |
| Drift | ❌ No | — | ✅ Yes | Threshold crossings only |

### 3.3 Preventing Enum Explosion

**Rule:** Each dimension has a fixed, small state space

```
Lifecycle: 5 states (draft, active, paused, completed, abandoned)
Window: 4 states (idle, window_open, nudge_sent, snoozed)
Nudge: 4 states (not_sent, sent_pending, acknowledged, expired)
Drift: 4 classifications (healthy, warning, drifting, critical)

Total conceptual states: 5 × 4 × 4 × 4 = 320
But stored states: 5 (lifecycle only)
Computed permutations: ephemeral, reconstructible
```

**Enforcement:**
- New states require architecture review
- No additions to lifecycle states (5 is sufficient)
- Window/nudge/drift states are internal — can add if needed (no storage impact)

---

## 4️⃣ Portable Trigger Engine Design

### 4.1 Pure Deterministic Function

```typescript
// Type definition (no implementation)

interface TriggerEngineInput {
  commitments: Commitment[];           // Active commitments for user
  now: number;                         // Timestamp (ms since epoch)
  eventHistory: BehaviourEvent[];    // All relevant events, 30d window
  guardrails: GuardrailConfig;        // User's guardrail preferences
  timezone: string;                   // User's timezone (IANA)
}

interface TriggerAction {
  type: 'nudge' | 'escalate' | 'drift_alert' | 'none';
  commitmentId: string;
  windowId?: string;
  milestoneId?: string;
  intensity: 'normal' | 'urgent' | 'low';
  surface: 'inbox' | 'push' | 'silent';  // push only if permitted
  reason: string;                       // For logging
}

interface TriggerEngineOutput {
  actions: TriggerAction[];            // Declarative actions to take
  suppressed: SuppressedTrigger[];     // Why triggers were blocked
  driftFlags: DriftFlag[];             // Drift classifications
  computedAt: number;                 // Timestamp for idempotency
}

interface SuppressedTrigger {
  commitmentId: string;
  reason: 'daily_cap' | 'quiet_hours' | 'cooldown' | 'domain_disabled' | 'already_outcomed';
  wouldHaveFiredAt: number;
}

interface DriftFlag {
  commitmentId: string;
  classification: 'healthy' | 'warning' | 'drifting' | 'critical';
  metrics: {
    completionRate: number;
    skipRatio: number;
    missStreak: number;
    daysSinceOutcome: number;
  };
}

// Pure function signature
type EvaluateTriggers = (input: TriggerEngineInput) => TriggerEngineOutput;
```

### 4.2 Input Contract

**All inputs must be serializable and deterministic:**

```
commitments:
  - Must include: id, cadence_type, recurrence_rules, deadline_at, 
                  milestone_structure, subject_code, escalation_policy, status
  - Must NOT include: description, motivation (those are local-only)

now:
  - Unix timestamp in milliseconds
  - Caller responsible for timezone application

eventHistory:
  - Array of behaviour_events for this user
  - Filtered to: event_type in [
      'commitment_created',
      'commitment_outcome_logged',
      'commitment_status_changed',
      'drift_detected',
      'escalation_triggered'
    ]
  - Sorted by occurred_at ascending
  - 30 days of history sufficient for all calculations

guardrails:
  - From user_preferences.orchestration_prefs
  - Must have default values if null

timezone:
  - IANA timezone string (e.g., 'America/New_York')
  - Used for wall-clock calculations
```

### 4.3 Output Contract

**Output is purely declarative — no side effects:**

```
actions:
  - Caller must execute these actions
  - Order matters: process in array order
  - Caller filters by surface preference (e.g., skip 'push' if not permitted)

suppressed:
  - For analytics and debugging
  - Caller may log these as 'trigger_suppressed' events
  - Not required for correctness

driftFlags:
  - Caller compares to previous drift state
  - If classification changed, log 'drift_detected' or 'drift_resolved'

computedAt:
  - Idempotency key
  - Same inputs + same computedAt = same output (for caching)
```

### 4.4 Side-Effect Handling Pattern

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TRIGGER ENGINE (Pure Function)                                               │
│                                                                              │
│ Input → Compute → Output(actions, suppressed, driftFlags)                    │
│                                                                              │
│ NO side effects. NO external calls. NO state mutation.                      │
└──────────────────────┬───────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ ACTION EXECUTOR (Impure, Platform-Specific)                                   │
│                                                                              │
│ for each action in output.actions:                                         │
│   IF action.surface === 'push' && pushPermissionGranted:                   │
│     sendPushNotification(action)                                             │
│   ELSE IF action.surface === 'inbox':                                      │
│     addToInboxQueue(action)  // IndexedDB                                     │
│   ELSE IF action.type === 'escalate':                                      │
│     logEvent('escalation_triggered', action)                                 │
│                                                                              │
│ for each suppressed in output.suppressed:                                  │
│   logEvent('trigger_suppressed', suppressed)                                 │
│                                                                              │
│ for each drift in output.driftFlags:                                       │
│   IF drift.classification !== previous_classification:                       │
│     logEvent(drift.classification === 'healthy' ? 'drift_resolved' : 'drift_detected', drift)
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Multi-Platform Execution

**Client (Foreground):**
```javascript
// Browser/React Native
const output = evaluateTriggers({
  commitments: await fetchActiveCommitments(),
  now: Date.now(),
  eventHistory: await fetchEventHistory(),
  guardrails: await fetchGuardrails(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
});

executeActions(output); // Platform-specific
```

**Server (Cron):**
```javascript
// Next.js API route
export async function POST() {
  for (const user of activeUsers) {
    const output = evaluateTriggers({
      commitments: await getCommitments(user.id),
      now: Date.now(),
      eventHistory: await getEvents(user.id, 30),
      guardrails: await getGuardrails(user.id),
      timezone: user.timezone
    });
    
    // Server can only send push notifications or log events
    // Inbox items are client-only
    for (const action of output.actions) {
      if (action.surface === 'push') {
        await sendPushNotification(user.id, action);
      }
    }
    
    // Log all suppressed triggers (analytics)
    for (const suppressed of output.suppressed) {
      await logEvent(user.id, 'trigger_suppressed', suppressed);
    }
  }
}
```

**Key:** Same `evaluateTriggers` function, same output, different executors.

---

## 5️⃣ Commitment Extraction Engine Layer

### 5.1 Layer Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ CONVERSATION LAYER (Existing — AI Layer)                                     │
│ • Natural language understanding                                            │
│ • Context management                                                        │
│ • Response generation                                                       │
└──────────────────────┬───────────────────────────────────────────────────────┘
                       │ conversation transcript
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ EXTRACTION ENGINE (NEW — Deterministic)                                       │
│                                                                              │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                │
│ │ Intent Detector │  │ Candidate       │  │ Structured      │                │
│ │                 │  │ Generator       │  │ Confirmation  │                │
│ │ • commitment    │  │ • slot filling  │  │ • schema        │                │
│ │   intent?       │→ │ • validation    │→ │   validation    │                │
│ │ • confidence    │  │ • defaults      │  │ • user confirm  │                │
│ │   score         │  │ • ambiguity     │  │ • rejection     │                │
│ │                 │  │   detection     │  │   handling      │                │
│ └─────────────────┘  └─────────────────┘  └─────────────────┘                │
│                                                                              │
│ Output: CommitmentCandidate | null | ClarificationQuestion                  │
└──────────────────────┬───────────────────────────────────────────────────────┘
                       │ validated candidate
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ COMMITMENT CREATION (Execution Layer)                                       │
│ • Log 'commitment_created' event                                            │
│ • Store metadata to Supabase                                                  │
│ • Store description to IndexedDB                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Extraction Rules

**Intent Detection:**
```
Trigger phrases (examples):
  - "I want to..." → commitment intent
  - "I need to start..." → commitment intent
  - "Goal: ..." → commitment intent
  - "My resolution is..." → commitment intent

Confidence scoring:
  - HIGH (>0.8): Clear temporal marker + target + domain
    Example: "I want to exercise 3 times a week in the mornings"
  
  - MEDIUM (0.5-0.8): Some markers missing, inferable
    Example: "I should work out more"
  
  - LOW (<0.5): Ambiguous, could be reflection or question
    Example: "Exercise is important"

Extraction only proceeds if confidence >= 0.7
```

**Slot Filling (what must be extracted):**
```
Required slots:
  1. domain: sleep | focus | fitness | abstinence | routine | social
  2. cadence_type: recurring | deadline | milestone
  3. target: {type, value, unit}
  4. schedule: {windows} OR deadline_at OR milestone_structure

Optional slots:
  5. motivation: why this matters (local-only)
  6. success_criteria: how they'll know it's done

Defaults applied if missing:
  - cadence_type: 'recurring' (if no deadline mentioned)
  - target.type: 'boolean' (if no count/duration specified)
  - schedule: inferred from temporal phrases ("mornings" → 06:00-10:00)
```

**Validation Rules:**
```
Reject candidate if:
  - target.value > 100 (likely error)
  - schedule windows overlap
  - deadline_at < now() (past deadline)
  - milestone weights don't sum to 100%
  - domain not in allowlist

Flag for clarification if:
  - Multiple possible domains ("I want to be healthier" → fitness? sleep?)
  - Ambiguous cadence ("every day" vs "daily" — same, but confirm)
  - Unclear target ("do better" → what metric?)
```

### 5.3 Confirmation Protocol

```
Candidate generated → Present to user → User responds

Presentation format:
  "I understood you want to [description].
   
   Here's what I captured:
   • Domain: [domain]
   • Target: [target description]
   • Schedule: [schedule description]
   • Type: [cadence_type]
   
   Is this correct? (Yes / Edit / No, drop it)"

User responses:
  - "Yes" → Create commitment, log event
  - "Edit" → Return to slot filling with current values as defaults
  - "No" → Discard, log 'extraction_rejected' (for analytics)
  - Correction utterance → Re-run extraction with correction context

Max confirmation rounds: 2
After 2 rounds, abandon extraction (prevent loop)
```

### 5.4 Rejection Handling

```
Rejection types:
  1. User rejection: "No, that's not what I meant"
     → Log 'extraction_rejected' with reason: 'user_correction'
     → Offer to try again or drop
  
  2. System rejection: Validation failed
     → Explain why (specific validation error)
     → Offer to fix or drop
  
  3. Ambiguity: Multiple interpretations possible
     → Present options: "Did you mean A or B?"
     → User selects or provides clarification

Learning (future):
  - Track which slot types cause most rejections
  - Improve extraction for high-rejection slots
  - Do NOT train on user content (privacy)
```

### 5.5 Confidence Thresholds

```
Confidence: 0.0 - 1.0

< 0.5:   Do not extract. Treat as conversational reflection.
0.5-0.7: Tentative. Ask clarifying question before presenting candidate.
0.7-0.9: Confident. Present candidate for confirmation.
> 0.9:   Very confident. Present with "Quick confirm" UI (streamlined).

Never auto-create without user confirmation.
No "smart" commitments created silently.
```

### 5.6 Where This Layer Lives

**Client-side:**
- Extractor runs in browser/React Native
- No server round-trip for extraction (privacy)
- Server only involved for final commitment storage

**Reasoning:**
- Extraction processes personal content (conversation)
- Keep personal content local
- Only structured metadata goes to server

**File organization:**
```
lib/
  execution/
    extraction/
      intentDetector.ts      → Pattern matching, confidence scoring
      slotFiller.ts          → Extract slots from utterance
      candidateValidator.ts  → Validate filled slots
      confirmationHandler.ts → Handle user confirmation flow
      index.ts               → Orchestrate extraction pipeline
```

---

## 6️⃣ Event Type Governance & Explosion Control

### 6.1 Naming Rules

```
Format: {domain}_{action}_{object}

Domains:
  - commitment   → Commitment lifecycle
  - trigger      → Trigger engine
  - outcome      → Outcome logging
  - drift        → Drift detection
  - escalation   → Escalation logic
  - guardrail    → Guardrail enforcement
  - adaptation   → Adaptation proposals
  - extraction   → Commitment extraction

Actions:
  - created, updated, deleted (lifecycle)
  - fired, suppressed (trigger)
  - logged (outcome)
  - detected, resolved (drift)
  - triggered (escalation)
  - enforced (guardrail)
  - proposed, accepted, rejected (adaptation)
  - attempted, confirmed, rejected (extraction)

Objects:
  - commitment, trigger, outcome, drift, escalation, guardrail, adaptation, candidate

Examples:
  ✓ commitment_outcome_logged
  ✓ trigger_fired
  ✓ drift_detected
  ✓ extraction_candidate_confirmed
  ✗ outcome_created (wrong domain)
  ✗ commitment_done (non-standard action)
  ✗ user_skipped (missing domain)
```

### 6.2 When to Add vs Reuse

**Reuse existing if:**
- Same semantic meaning (e.g., don't add 'commitment_completed' if 'commitment_outcome_logged' with outcome_code='completed' exists)
- Same data structure needed
- Can be distinguished by metadata fields

**Add new if:**
- Entirely new concept (e.g., 'milestone_progress_logged' — new in v2)
- Different side effects expected
- Different governance read patterns
- Cannot be expressed via metadata on existing type

**Decision checklist:**
```
Can this be expressed as existing_type + metadata? → Reuse
Does this require new governance read query? → Add new
Is this conceptually distinct from all existing? → Add new
Will this be queried frequently with its own filter? → Add new
```

### 6.3 Maximum Event Type Growth Policy

```
Hard limits:
  - Phase 2.0-2.6: Maximum 20 event types for Execution Spine
  - Current governance types: ~10
  - Total system maximum: 50 types

Current Execution Spine types (proposed):
  1. commitment_created
  2. commitment_outcome_logged
  3. commitment_status_changed
  4. trigger_fired
  5. trigger_suppressed
  6. drift_detected
  7. drift_resolved
  8. escalation_triggered
  9. adaptation_proposed
  10. adaptation_accepted
  11. extraction_attempted
  12. extraction_confirmed
  13. extraction_rejected
  14. milestone_progress_logged
  15. guardrail_enforced

Remaining budget: 5 types for Phase 2.x

Adding a new type requires:
  1. Architecture review approval
  2. Migration plan for existing events (if any)
  3. Governance query pattern documentation
  4. Removal plan (when obsolete)
```

### 6.4 Versioning Strategy

```
Event types are versioned via metadata, not type name:

{
  event_type: 'commitment_outcome_logged',
  metadata: {
    version: 2,  // Schema version of this event
    outcome_code: 'completed',
    window_id: 'abc',
    // v2 adds: effort_level (optional)
    effort_level: 3  // 1-5, added in v2
  }
}

Backward compatibility:
  - Readers must handle missing v2 fields in v1 events
  - Writers must set version field
  - Max 2 versions supported concurrently
  - Old version deprecated after 90 days

No breaking changes:
  - Never remove fields
  - Never change field meanings
  - Only add optional fields
```

---

## 7️⃣ Architectural Red Flags

### 7.1 Overbuilding Indicators

| Red Flag | Why It's Bad | Correct Approach |
|----------|--------------|------------------|
| **New table for computed metrics** | Duplication, sync risk, migration burden | Compute from events; cache client-side only |
| **Generic 'automation' engine** | Scope creep, endless configuration | Specific rule types with clear boundaries |
| **Plugin architecture for triggers** | Premature abstraction, complexity | Hardcoded trigger types (3-5 max) |
| **User-defined trigger conditions** | Non-deterministic, hard to validate | System-defined rules with parameters |
| **Nested commitment trees** | Complexity without clear user need | Flat structure; milestones as simple list |
| **Real-time sync requirements** | Engineering burden, conflict resolution | Eventual consistency; client authoritative |

### 7.2 Psychological Creepiness Indicators

| Red Flag | Why It's Creepy | Correct Approach |
|----------|-----------------|------------------|
| **Notifications when app not opened recently** | "We know you're not using us" | Only trigger within active sessions |
| **Emotional state inference** | "You seem stressed, here's a nudge" | No emotion detection; only explicit commitments |
| **Social pressure tactics** | "Others are doing better" | No comparisons; individual progress only |
| **Guilt-inducing language** | "You missed again" | Neutral framing; "Window closed" not "You failed" |
| **Unsolicited check-ins** | "How are you doing?" popups | Context-linked only; no random wellness nudges |
| **Predictive "we knew you'd skip"** | Patronizing, surveillance-feeling | No prediction claims; present only |

### 7.3 Governance Contamination Indicators

| Red Flag | Contamination | Prevention |
|----------|---------------|------------|
| **Execution imports from governance/** | Coupling, circular risk | CI check: `grep -r "from '@/lib/governance'" lib/execution/` must fail |
| **stateEngine.ts modified for Execution** | Governance bloat | stateEngine.ts frozen; no edits for Execution |
| **governance_state column added for Execution** | State duplication | Use behaviour_events; don't extend governance_state |
| **Execution queries governance_state table** | Race condition, timing dependency | Execution evaluates from events only |
| **AI writes to commitment status** | Bypassing governance | AI only reads; status changes via user action → events |
| **Real-time governance updates** | Complexity, inconsistency | Daily cron only; no real-time stateEngine |

### 7.4 Code Review Blocking Conditions

**Any PR containing the following must be rejected:**

1. ❌ New table with 'computed' or 'cache' in name
2. ❌ Free-text column in new table (use banned fields list)
3. ❌ Import of `governance/` from `execution/`
4. ❌ Query of `governance_state` table from Execution code
5. ❌ Auto-creation of commitments without confirmation
6. ❌ Event type added without architecture review
7. ❌ State stored that can be computed from events
8. ❌ Client-side AI for trigger timing (non-deterministic)
9. ❌ Real-time WebSocket for commitment updates
10. ❌ User-defined trigger rules (regex, conditions)

**Any PR should be questioned if it contains:**

1. ⚠️ New JSONB column (is it necessary? can it be normalized?)
2. ⚠️ New enum value (is it distinct? can it be metadata?)
3. ⚠️ Client-side state for ephemeral UI (is it reconstructible?)
4. ⚠️ Cached metric with TTL (why not compute?)
5. ⚠️ Background sync interval < 60 seconds (battery impact)

### 7.5 Refined Architecture Invariants

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ REFINED ARCHITECTURE INVARIANTS                                               │
│                                                                               │
│ 1. UNIDIRECTIONAL DATA FLOW                                                   │
│    Execution → behaviour_events → Governance (never reverse)                  │
│                                                                               │
│ 2. NO COMPUTED STATE STORAGE                                                  │
│    Storing: lifecycle state only                                               │
│    Computing: window state, drift, rates, streaks, next trigger             │
│                                                                               │
│ 3. DETERMINISTIC EVALUATION                                                   │
│    Same inputs (commitments + events + now) → same outputs                    │
│    No randomness, no ML inference, no external state                          │
│                                                                               │
│ 4. METADATA-ONLY SERVER                                                       │
│    Server: codes, numbers, timestamps, JSON config                            │
│    Client: descriptions, motivation, templates, inbox                       │
│                                                                               │
│ 5. GOVERNANCE IMMUTABLE                                                       │
│    stateEngine.ts frozen                                                      │
│    behaviour_events schema append-only                                        │
│    No governance changes for Execution Spine                                  │
│                                                                               │
│ 6. EVENT BUDGET ENFORCED                                                      │
│    Max 20 Execution event types                                               │
│    New types require review and removal plan                                  │
│                                                                               │
│ 7. PURE TRIGGER ENGINE                                                        │
│    evaluateTriggers(): no side effects, portable, deterministic                │
│    Platform-specific: Action Executor only                                    │
│                                                                               │
│ 8. CONFIRMATION REQUIRED                                                      │
│    No auto-commitment creation                                                │
│    Confidence threshold + user confirmation mandatory                         │
│                                                                               │
│ 9. CREEPINESS ZERO TOLERANCE                                                  │
│    No emotion detection                                                       │
│    No social comparison                                                       │
│    No unsolicited nudges                                                     │
│    No predictive guilt                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

**END OF REFINEMENT PLAN**

*Structural weaknesses corrected. Architecture stress-tested. Ready for implementation planning.*
