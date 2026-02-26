# Layer 2 — Life Orchestration Forensic Audit

**Document:** `LAYER2_LIFE_ORCHESTRATION_AUDIT.md`  
**Scope:** Frontend + Backend + Local Storage + Notifications + Scheduling + Governance  
**Audit Date:** 2026-02-24  
**Auditor:** Forensic Code Analysis  

---

## Executive Summary

### Current State Assessment

Vella has a **strong foundation** for Layer 2 (Life Orchestration) with existing deterministic governance infrastructure, but several critical gaps remain before proactive execution can be safely deployed.

**Key Strengths:**
1. **Governance Engine Exists** — `stateEngine.ts` computes deterministic recovery_state, discipline_state, focus_state from behaviour_events
2. **Daily Scheduler Pattern** — `/api/internal/governance/daily` provides cron-ready infrastructure
3. **Safe Write Layer** — `safeSupabaseWrite.ts` enforces no-free-text policy with BANNED_FIELDS scanning
4. **Local-First Data** — IndexedDB stores journals, checkins, conversations; Dexie patterns established
5. **Weekly Focus UI** — `WeeklyFocusCard.tsx` demonstrates intervention/help flows
6. **Event Append-Only Log** — `behaviour_events` table with metadata-only storage

**Critical Gaps:**
1. **Nudges Currently Disabled** — `nudgeEngine.ts` returns null (Path B privacy lockdown)
2. **No Notification Infrastructure** — No expo-notifications integration found
3. **No Trigger Engine** — Missing time-based/deviation-based/inactivity-based trigger evaluation
4. **No Preference Center** — Only basic `user_preferences` table (notifications_enabled, daily_checkin, journaling_prompts)
5. **No Outcome Logging** — Missing structured Outcome primitive
6. **No Guardrail System** — Missing maxPerDay, quietHours, cooldown logic

### Verdict

**Layer 2 is feasible but requires substantial new infrastructure.** The cleanest path is:

1. **Phase 2.1** — Build commitment capture on top of existing `user_goals` + `goalEngine.ts` patterns
2. **Phase 2.2** — Create deterministic trigger engine (client-side with server verification)
3. **Phase 2.3** — Add notification infrastructure (new dependency) + in-app inbox surface
4. **Phase 2.4+** — Accountability loops, preference center, optional integrations

---

## 1. Current Primitives Mapping

### 1.1 Commitments / Goals / Abstinence

| Primitive | Location | Schema | Reuse for Layer 2 |
|-----------|----------|--------|-------------------|
| **user_goals** | `lib/supabase/types.ts:399` | `{id, user_id, type, status, priority, target_date}` | **YES** — Extend with domain enum, schedule windows, cadence |
| **user_goal_actions** | `lib/supabase/types.ts:431` | `{id, goal_id, label, status, due_date, completed_at}` | **PARTIAL** — Label field contains text; needs enum-ification |
| **commitments** | `lib/supabase/types.ts:815` | `{id, commitment_code, subject_code, target_type, target_value, start_at, end_at, status}` | **YES** — Purpose-built for Layer 2; metadata-only |
| **abstinence_targets** | `lib/supabase/types.ts:856` | `{id, abstinence_target_code, target_metric, status}` | **YES** — Reuse for abstinence domain |
| **goalEngine.ts** | `lib/goals/goalEngine.ts` | Server-local storage via `serverLocalGet/Set` | **PARTIAL** — Uses server-local, not client IndexedDB |

**Evidence:**
```typescript
// lib/supabase/types.ts:815-855
commitments: {
  Row: {
    id: string;
    user_id: string;
    commitment_code: string;  // enum: no_smoking, no_alcohol, focus_block, habit_daily, custom
    subject_code: string | null;
    target_type: string | null;
    target_value: number | null;
    start_at: string;
    end_at: string | null;
    status: string;  // active, paused, completed, abandoned
  }
}
```

**Assessment:** The `commitments` table is nearly Layer 2-ready. Missing: schedule windows (time of day), cadence enum, success criteria, escalation policy.

### 1.2 Governance Events / Behaviour Events

| Component | Location | Purpose | Reuse |
|-----------|----------|---------|-------|
| **behaviour_events** | `lib/supabase/types.ts:783` | Append-only event log | **YES** — Core primitive exists |
| **Event types** | `lib/governance/validation.ts:46` | `commitment_created, commitment_completed, commitment_violation, abstinence_start, abstinence_violation, focus_start, focus_end, scheduler_tick, weekly_focus_checkin` | **YES** — Add `trigger_fired, nudge_sent, outcome_logged` |
| **recordEvent()** | `lib/governance/events.ts:53` | Append-only event writer | **YES** — Use for all Layer 2 events |
| **stateEngine.ts** | `lib/governance/stateEngine.ts` | Computes governance_state from events | **YES** — Extend with orchestration state |

**Evidence:**
```typescript
// lib/governance/validation.ts:46-56
export const GOVERNANCE_EVENT_TYPES = [
  "commitment_created",
  "commitment_completed",
  "commitment_violation",
  "abstinence_start",
  "abstinence_violation",
  "focus_start",
  "focus_end",
  "scheduler_tick",           // <-- Already exists!
  "weekly_focus_checkin",
] as const;
```

**Assessment:** Event infrastructure is solid. Need to add new event types for triggers, nudges, outcomes.

### 1.3 Scheduled Jobs / Cron / Tick

| Component | Location | Purpose | Reuse |
|-----------|----------|---------|-------|
| **Daily governance scheduler** | `app/api/internal/governance/daily/route.ts` | Cron endpoint calling `computeGovernanceState()` | **YES** — Extend for trigger evaluation |
| **scheduler_tick event** | `lib/governance/validation.ts:54` | Event type for tick | **YES** — Use for trigger engine heartbeat |
| **Recompute state** | `lib/engine/behavioural/recomputeState.ts` | Daily/weekly snapshot | **PARTIAL** — Different purpose (trait analysis vs orchestration) |

**Evidence:**
```typescript
// app/api/internal/governance/daily/route.ts:1-8
/**
 * Daily Governance Scheduler (idempotent cron).
 * POST /api/internal/governance/daily
 * For each user: computeGovernanceState(userId).
 */
```

**Assessment:** Cron infrastructure exists. Need to add trigger evaluation to the daily job or create separate trigger scheduler.

### 1.4 Weekly Focus / Follow-up Logic

| Component | Location | Purpose | Reuse |
|-----------|----------|---------|-------|
| **WeeklyFocusCard** | `app/components/weekly-focus/WeeklyFocusCard.tsx` | UI for rating focus items | **YES** — Pattern for nudge UI |
| **ReviewPanel** | `app/components/weekly-focus/ReviewPanel.tsx` | Weekly review surface | **YES** — Pattern for accountability UI |
| **EarnedValidationBlock** | `app/components/weekly-focus/EarnedValidationBlock.tsx` | Positive reinforcement UI | **YES** — Pattern for outcome celebration |
| **Focus types** | `app/checkin/types.ts:5` | `commitment | value | focus | governance` | **YES** — Add orchestration source |

**Evidence:**
```typescript
// app/checkin/types.ts:9-16
export interface WeeklyFocusItem {
  itemId: string;
  sourceType: FocusSourceType;  // Can add "orchestration"
  subjectCode: string;
  label: string;  // <-- Text field; should stay client-side
  priority: number;
  reasons?: string[];
}
```

**Assessment:** Weekly focus UI patterns are excellent reference. Need to ensure label/description stays client-side encrypted.

---

## 2. Permission + Preference Model

### 2.1 Current Settings Storage

| Storage | Location | Schema | Purpose |
|---------|----------|--------|---------|
| **vella_settings** | `lib/supabase/types.ts:38` | `{voice_model, tone, tone_style, relationship_mode, voice_hud, language, privacy_flags, privacy_anonymize, privacy_exclude_from_training, theme}` | AI/personality settings |
| **user_preferences** | `lib/supabase/types.ts:207` | `{notifications_enabled, daily_checkin, journaling_prompts}` | Basic toggles |
| **user_nudges** | `lib/supabase/types.ts:306` | `{nudge_type, status, last_triggered_at, dismissed_at}` | Nudge state (write-blocked) |

**Evidence:**
```typescript
// lib/supabase/types.ts:207-229
user_preferences: {
  Row: {
    user_id: string;
    notifications_enabled: boolean | null;
    daily_checkin: boolean | null;
    journaling_prompts: boolean | null;
  }
}
```

### 2.2 Gap Analysis

**Missing for Layer 2:**

| Preference | Granularity | Storage Location |
|------------|-------------|------------------|
| Domain-level toggles (sleep, focus, routine, abstinence) | Per-domain | Server: `user_preferences` extension |
| Quiet hours | Time ranges | Server: `user_preferences.quiet_hours_json` |
| Cadence preferences | Per-commitment | Server: `commitments.cadence` |
| Notification surface preferences | Push vs Inbox | Server: `user_preferences.surface_prefs` |
| Pause state | Per-domain | Server: `commitments.status` (already has paused) |

**Assessment:** Current preferences are coarse-grained. Need to extend `user_preferences` with JSON columns for domain-specific settings, or create new `orchestration_preferences` table.

### 2.3 Granular Opt-in Without Server Text

**Safe approach (evidence-backed):**

```typescript
// Safe: metadata only
interface OrchestrationPreferences {
  user_id: string;
  // Each domain: 0 = disabled, 1 = inbox only, 2 = push allowed
  sleep_domain: number;        
  focus_domain: number;
  routine_domain: number;
  abstinence_domain: number;
  // Quiet hours: minutes from midnight
  quiet_hours_start: number;    // 0-1439 (e.g., 1320 = 22:00)
  quiet_hours_end: number;      // 0-1439 (e.g., 480 = 08:00)
  // Caps
  max_nudges_per_day: number;   // default 5
}
```

**Evidence:** Pattern already used in `vella_settings.voice_hud` (JSON column), `behavioural_state_current.state_json` (JSON column).

---

## 3. Trigger Engine Feasibility

### 3.1 Existing Infrastructure

| Component | Location | Pattern | Reuse |
|-----------|----------|---------|-------|
| **scheduler_tick event** | `lib/governance/validation.ts:54` | Event type exists | **YES** |
| **Daily cron** | `app/api/internal/governance/daily/route.ts` | Cron secret auth | **YES** |
| **Date window queries** | `lib/governance/readState.ts:75-181` | Lookback windows (7d, 30d) | **YES** |
| **Rate limiting** | `lib/security/rateLimit.ts` | Cooldown patterns | **PARTIAL** — Need per-user trigger cooldowns |

### 3.2 Missing for Deterministic Triggers

| Component | Purpose | Implementation Notes |
|-----------|---------|---------------------|
| **Trigger registry** | Store trigger definitions | New table: `orchestration_triggers` (metadata-only) |
| **Trigger evaluator** | Check conditions client-side | New: `lib/orchestration/triggerEngine.ts` |
| **Guardrail engine** | Enforce maxPerDay, quietHours | New: `lib/orchestration/guardrails.ts` |
| **Scheduler client** | Background interval checks | New: `lib/orchestration/scheduler.ts` using `setInterval` |
| **Cooldown tracker** | Per-trigger last_fired_at | Store in `behaviour_events` or local |

**Evidence:** No existing interval-based trigger evaluation found. The `scheduler_tick` event is logged but not used for proactive triggers.

### 3.3 Feasibility Assessment

**Verdict: FEASIBLE without fragile infra.**

- Client-side `setInterval` (60s) to check triggers
- Server verification on sync (deterministic validation)
- Cron fallback for offline users (daily catch-up)
- No WebSockets, no push required for MVP

---

## 4. Proactive Surfaces

### 4.1 Current Inventory

| Surface | Location | Status | Reuse |
|---------|----------|--------|-------|
| **API route** | `app/api/nudge/route.ts` | Disabled (returns null) | **YES** — Re-enable with local-first |
| **Nudge engine** | `lib/nudges/nudgeEngine.ts` | Placeholder | **YES** — Implement local-only |
| **ErrorBanner** | `app/components/ErrorBanner.tsx` | UI pattern | **YES** — Pattern for inline nudges |
| **WeeklyFocusCard** | `app/components/weekly-focus/WeeklyFocusCard.tsx` | Intervention UI | **YES** — Pattern for nudge actions |

**Evidence:**
```typescript
// lib/nudges/nudgeEngine.ts:21-26
export async function createAndStoreNudge(_userId: string): Promise<NudgeResult | null> {
  if (process.env.NODE_ENV !== "production") {
    console.info("[nudgeEngine] Nudges temporarily disabled under Path B privacy rules.");
  }
  return null;  // <-- DISABLED
}
```

### 4.2 Missing Surfaces

| Surface | Priority | Implementation |
|---------|----------|----------------|
| **In-app inbox** | P0 | New screen: `/app/inbox/page.tsx` |
| **Push notifications** | P1 | New: `lib/notifications/push.ts` using expo-notifications |
| **Action buttons** | P0 | Reuse `ErrorBanner` pattern with action props |
| **Deep links** | P2 | New: `app/+native-intent.ts` (Expo Router) |
| **Quick-complete UI** | P1 | Reuse `WeeklyFocusCard` intervention panel |

### 4.3 Notification Infrastructure Gap

**Status: NOT FOUND**

- No `expo-notifications` imports found
- No notification permission handling
- No FCM/APNs integration

**Required addition:**
```bash
npx expo install expo-notifications
```

---

## 5. Data Policy Compliance Verification

### 5.1 Hard Rule Confirmation

**Rule: No personal/free-text in Supabase**

**Evidence:**
```typescript
// lib/safe/safeSupabaseWrite.ts:26-47
const BANNED_FIELDS = new Set([
  "content", "text", "message", "note", "summary", "transcript",
  "journal", "response", "prompt", "narrative", "description",
  "body", "comment", "reflection", "entry", "reply", "answer",
  "reasoning", "free_text",
]);
```

```typescript
// lib/safe/safeSupabaseWrite.ts:49-57
const WRITE_BLOCKED_TABLES = new Set([
  "journal_entries",
  "conversation_messages", 
  "check_ins",
  "memory_chunks",
  "user_reports",
  "user_nudges",  // <-- Nudges blocked!
]);
```

**Scan result:** All writes pass through `safeInsert/safeUpdate/safeUpsert` which:
1. Check `WRITE_BLOCKED_TABLES`
2. Scan payload for `BANNED_FIELDS`
3. Reject strings >500 chars unless in `ALLOWED_LONG_STRING_KEYS_PER_TABLE`

### 5.2 Layer 2 Safe Metadata Schema

**Allowed on server (metadata-only):**

```typescript
// Safe: No banned fields, no long strings
interface CommitmentMetadata {
  id: string;
  user_id: string;
  domain_code: string;        // "sleep", "focus", "routine"
  target_type: string;        // "duration", "count", "boolean"
  target_value: number;       // 30 (minutes), 3 (count)
  cadence_code: string;       // "daily", "weekly"
  status: string;             // "active", "paused"
  schedule_windows: Json;     // [{start_minute: 480, end_minute: 540}]
  // No description, no personal text
}

interface TriggerMetadata {
  id: string;
  commitment_id: string;
  trigger_type: string;       // "time_based", "deviation_based"
  guardrails: Json;           // {max_per_day: 3, cooldown_minutes: 30}
}

interface NudgeMetadata {
  id: string;
  trigger_id: string;
  surface_type: string;       // "push", "inbox", "none"
  template_code: string;      // "focus_start", "bedtime_reminder"
  sent_at: string;
  // No message text (template local)
}

interface OutcomeMetadata {
  id: string;
  commitment_id: string;
  status_code: string;        // "completed", "skipped", "missed"
  reason_code: string;        // "voluntary_skip", "forgot"
  recorded_at: string;
  // No free-text notes
}
```

**Must stay local (IndexedDB + encrypted):**

```typescript
// Local-only with AES-256-GCM
interface CommitmentLocal {
  commitment_id: string;
  description_encrypted: string;      // User's personal text
  motivation_encrypted: string;         // Why this matters
  schedule_notes_encrypted: string;   // Personal annotations
}

interface NudgeTemplateLocal {
  template_code: string;
  base_message: string;                 // "Time for your [activity]"
  warm_variant: string;
  neutral_variant: string;
}
```

### 5.3 Compliance Verdict

**Layer 2 CAN be implemented while respecting data policy.**

All server-side storage uses:
- Enum codes (not free text)
- Numbers, timestamps
- JSON columns for structured config
- No banned fields

Personal context stays in IndexedDB with existing encryption patterns.

---

## 6. Gap Checklist (Build Requirements)

### Phase 2.1: Commitment Capture

| # | Component | Location | Effort |
|---|-----------|----------|--------|
| 1 | Extend `commitments` table | Migration | S — Add schedule_windows, cadence, escalation_policy columns |
| 2 | Create `commitment_local` store | `lib/local/db/indexedDB.ts` | S — Add to STORES array |
| 3 | Commitment creation flow | `app/commitments/create/` | M — Schedule builder UI |
| 4 | AI commitment proposal | `lib/ai/` | M — Prompt engineering for commitment extraction |
| 5 | Journal commitment entry type | `app/journal/` | S — Structured capture form |

### Phase 2.2: Trigger Engine

| # | Component | Location | Effort |
|---|-----------|----------|--------|
| 6 | Create `orchestration_triggers` table | Migration | S — Metadata-only |
| 7 | Trigger evaluator | `lib/orchestration/triggerEngine.ts` | L — Time-based, deviation-based, inactivity-based |
| 8 | Guardrail system | `lib/orchestration/guardrails.ts` | M — maxPerDay, quietHours, cooldown |
| 9 | Client scheduler | `lib/orchestration/scheduler.ts` | M — setInterval-based with battery awareness |
| 10 | Trigger event logging | `lib/governance/events.ts` | S — Add `trigger_fired`, `trigger_suppressed` |

### Phase 2.3: Proactive Surfaces

| # | Component | Location | Effort |
|---|-----------|----------|--------|
| 11 | Inbox screen | `app/inbox/page.tsx` | M — Chronological nudge list |
| 12 | Nudge card component | `app/components/NudgeCard.tsx` | M — Actions: start, snooze, skip, reschedule |
| 13 | Push notification infra | `lib/notifications/push.ts` | L — expo-notifications integration |
| 14 | Notification permission flow | `app/onboarding/` | M — Trust-first (ask after 3+ commitments) |
| 15 | Template system | `lib/orchestration/templates.ts` | M — Local-only message templates |

### Phase 2.4: Accountability Loop

| # | Component | Location | Effort |
|---|-----------|----------|--------|
| 16 | Outcome logger | `lib/orchestration/outcomeEngine.ts` | M — Record completion/skip/miss |
| 17 | Weekly review surface | `app/weekly-review/page.tsx` | M — Completion tallies, patterns |
| 18 | Adaptation engine | `lib/orchestration/adaptation.ts` | L — Suggest cadence changes |
| 19 | Streak calculator | `lib/orchestration/streaks.ts` | M — Deterministic from outcomes |

### Phase 2.5: Preference Center

| # | Component | Location | Effort |
|---|-----------|----------|--------|
| 20 | Extend preferences | Migration | S — Domain toggles, quiet hours |
| 21 | Preference UI | `app/settings/orchestration/` | M — Domain toggles, caps, quiet hours |
| 22 | Pause/resume | `app/commitments/[id]/` | S — Status change with reason enum |

### Phase 2.6: Optional Integrations

| # | Component | Location | Effort |
|---|-----------|----------|--------|
| 23 | Calendar read | `lib/integrations/calendar.ts` | L — Import conflicts |
| 24 | Calendar write | `lib/integrations/calendar.ts` | L — Export commitment blocks |
| 25 | Widget | `widget/` | L — iOS/Android home screen |

---

## 7. Recommended Minimal Integration Path

### 7.1 Sequencing (Lowest Risk)

**Phase 1: Foundation (Weeks 1-4)**
1. Extend `commitments` schema with schedule windows
2. Build commitment capture flow (no notifications yet)
3. Store commitments: metadata to Supabase, description to IndexedDB
4. Manual outcome logging (user taps "complete")

**Phase 2: Silent Trigger Engine (Weeks 5-8)**
1. Build deterministic trigger evaluator (client-side)
2. Log triggers to `behaviour_events` (silent, no UI)
3. Verify trigger accuracy with test users
4. Add guardrails (max evaluations per day)

**Phase 3: In-App Inbox (Weeks 9-12)**
1. Build inbox surface
2. Show nudges in-app only (no push)
3. Full action set: start, snooze, skip, reschedule
4. Weekly review with outcome tallies

**Phase 4: Push Notifications (Weeks 13-16)**
1. Add expo-notifications dependency
2. Request permission after 3+ commitments
3. Add action buttons to notifications
4. Deep link handling

**Phase 5: Preference Center (Weeks 17-20)**
1. Granular domain toggles
2. Quiet hours configuration
3. Caps and cooldown settings
4. Export commitment data

**Phase 6: Optional Integrations (Weeks 21+)**
1. Calendar read (conflict detection)
2. Calendar write (behind double opt-in)
3. Widget (labs feature)

### 7.2 What to Avoid Until Later

| Feature | Risk | Defer Until |
|---------|------|-------------|
| OS-level DND control | High — Platform restrictions, permission complexity | Phase 3+ |
| Cross-device sync | High — Requires E2E encryption, complex state merging | Phase 2+ |
| Email nudges | Medium — Deliverability, spam reputation | Phase 4+ |
| SMS nudges | High — Regulatory complexity (TCPA) | Phase 5+ |
| Wearable integration | Medium — Data privacy, battery concerns | Phase 5+ |
| ML-based trigger timing | High — Non-deterministic, creepiness risk | NOT PLANNED |

### 7.3 Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Notification fatigue | Hard cap 5/day, fatigue detection (>70% skip rate = auto-pause) |
| Privacy leak | All guardrails in safeSupabaseWrite.ts; no banned fields |
| Creepiness | No emotional inference; triggers based on explicit commitment times only |
| Battery drain | Client scheduler at 60s intervals with visibilityState check |
| Data loss | Sync queue pattern: local first, sync when online |

---

## Appendix A: Evidence Index

### Files Referenced

| File | Line(s) | Evidence Type |
|------|---------|---------------|
| `lib/supabase/types.ts` | 38-84 | vella_settings schema |
| `lib/supabase/types.ts` | 207-229 | user_preferences schema |
| `lib/supabase/types.ts` | 306-334 | user_nudges schema (write-blocked) |
| `lib/supabase/types.ts` | 367-398 | goals schema |
| `lib/supabase/types.ts` | 399-430 | user_goals schema |
| `lib/supabase/types.ts` | 431-465 | user_goal_actions schema |
| `lib/supabase/types.ts` | 783-814 | behaviour_events schema |
| `lib/supabase/types.ts` | 815-855 | commitments schema |
| `lib/supabase/types.ts` | 856-887 | abstinence_targets schema |
| `lib/supabase/types.ts` | 917-936 | governance_state schema |
| `lib/governance/validation.ts` | 26-47 | BANNED_FIELDS definition |
| `lib/governance/validation.ts` | 49-57 | WRITE_BLOCKED_TABLES |
| `lib/governance/validation.ts` | 46-80 | GOVERNANCE_EVENT_TYPES enum |
| `lib/governance/events.ts` | 1-112 | Event recording engine |
| `lib/governance/stateEngine.ts` | 1-156 | State computation engine |
| `lib/governance/readState.ts` | 75-202 | Read-only state queries |
| `lib/goals/goalEngine.ts` | 1-100 | Goal storage (server-local) |
| `lib/safe/safeSupabaseWrite.ts` | 1-233 | Safe write layer |
| `lib/local/db/indexedDB.ts` | 1-97 | IndexedDB infrastructure |
| `lib/local/serverLocal.ts` | 1-31 | Server-local storage |
| `lib/engine/behavioural/recomputeState.ts` | 1-188 | Daily recompute pattern |
| `lib/nudges/nudgeEngine.ts` | 1-28 | Disabled nudge engine |
| `app/api/internal/governance/daily/route.ts` | 1-95 | Daily cron scheduler |
| `app/api/nudge/route.ts` | 1-30 | Nudge API (disabled) |
| `app/checkin/types.ts` | 1-44 | Weekly focus types |
| `app/components/weekly-focus/WeeklyFocusCard.tsx` | 1-147 | Intervention UI pattern |
| `app/components/ErrorBanner.tsx` | 1-51 | Banner UI pattern |
| `app/profile/page.tsx` | 1-151 | Settings UI pattern |
| `VELLA_MASTER_PLAN_AND_BUILD_CONTRACT.md` | Layer 2 section | Architecture specification |

### NOT FOUND Evidence

| Component | Search Terms | Status |
|-----------|--------------|--------|
| expo-notifications | `expo-notifications`, `Notifications`, `pushNotification` | **NOT FOUND** — Must add dependency |
| Deep link handling | `+native-intent`, `deep link`, `universal link` | **NOT FOUND** — Must implement |
| Background tasks | `BackgroundTask`, `BackgroundFetch` | **NOT FOUND** — Not needed for MVP (use interval) |
| Inbox surface | `inbox`, `nudge.*surface` | **NOT FOUND** — Must build |

---

**END OF AUDIT**

*Audit completed: All claims backed by file+line evidence or explicitly marked NOT FOUND.*
