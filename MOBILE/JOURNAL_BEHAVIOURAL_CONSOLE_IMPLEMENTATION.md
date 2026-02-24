# Journal → Behavioural Console — Implementation Summary

## File tree diff

### Deleted (Phase 1)

- `app/components/journal/JournalInsightsTab.tsx` — Mock insights, static threshold (7 entries), "Discuss with Vella" CTA.
- `app/components/journal/JournalSystemNotesTab.tsx` — Mock system notes (MOCK_SYSTEM_NOTES).
- `app/components/journal/JournalEntryList.tsx` — Entry list with consent badge, mode icons.
- `app/components/journal/JournalEntryModal.tsx` — Entry detail modal, Reflect with Vella, ConsentToggle.
- `app/components/journal/JournalComposerSimple.tsx` — Simple textarea + ConsentToggle.
- `app/components/journal/JournalComposer.tsx` — Mode-based composer (clear, reflect, work-through, plan, free-write, three-sentence).
- `app/components/journal/ConsentToggle.tsx` — Single "Allow Vella to learn from this" toggle (UI-only).
- `app/components/journal/JournalModeSelector.tsx` — Journal mode segmented control.

### Added

- `lib/journal/mapJournalToEvents.ts` — Maps enrichment to `recordEvent` + `computeGovernanceState`; no raw text.
- `app/api/journal/console/route.ts` — GET: governance_state, behavioural_state_current, recent behaviour_events (no user text).
- `app/api/journal/preview/route.ts` — POST: deterministic enrichment (loops, distortions, themes, traits) for live preview only.
- `app/components/journal/types.ts` — ProcessingMode, DomainCode, ConsoleState, PreviewSignal, ReactionType.
- `app/components/journal/DomainSelector.tsx` — Segmented control: Focus, Discipline, Health, Relationships, Identity, General.
- `app/components/journal/ConsentControl.tsx` — Three-way: Private | Structured signals only | Structured + governance.
- `app/components/journal/EntryConsole.tsx` — Domain + textarea (word count, timestamp) + ConsentControl.
- `app/components/journal/LiveSignalPreview.tsx` — Debounced POST /api/journal/preview; badges with severity/confidence; "No behavioural signals detected yet" when empty.
- `app/components/journal/ImpactProjection.tsx` — Risk delta, focus trend, discipline state, escalation from governance.
- `app/components/journal/SystemReactionFeed.tsx` — Maps behaviour_events to Observation / Signal / Governance / Action; "No behavioural events yet" when empty.
- `app/components/journal/MetricsStrip.tsx` — Identity stability %, Focus strength, Discipline state, Drift risk from governance + connectionDepth.

### Modified

- `app/journal/page.tsx` — Replaced with Behavioural Console: metrics strip, grid (EntryConsole + LiveSignalPreview), ImpactProjection, SystemReactionFeed; no tabs; save calls POST /api/journal with processingMode and subjectCode.
- `app/components/journal/index.ts` — Exports only new components and types (no JournalEntry, JournalModeSelector, etc.).
- `lib/security/validationSchemas.ts` — journalCreateSchema and journalUpdateSchema: added optional `processingMode`, `subjectCode`.
- `app/api/journal/route.ts` — POST/PUT: read processingMode and subjectCode; when `private` skip enrichment; when `signals_and_governance` and enrichment present, call `mapJournalToEvents` after create/update.

---

## New components

| Component | Role |
|-----------|------|
| `DomainSelector` | Segmented control for domain (Focus, Discipline, Health, Relationships, Identity, General). Maps to subject_code for API. |
| `ConsentControl` | Radio group: Private (no extraction), Structured signals only, Structured + governance. Persisted in page state and sent to API. |
| `EntryConsole` | Composes DomainSelector, textarea (word count, timestamp), ConsentControl. Primary input surface. |
| `LiveSignalPreview` | Debounces text, POSTs to /api/journal/preview, shows loops/distortions/themes/traits as badges with severity (S1–S5) and confidence (L/M/H). Shows "No behavioural signals detected yet" when no signals. |
| `ImpactProjection` | Reads governance from console state; shows Risk delta (up/down/neutral), Focus trend (improving/declining/stable), Discipline state, Escalation risk with icons. |
| `SystemReactionFeed` | Maps recent behaviour_events to reaction cards: Observation logged, Signal recorded, Governance updated, Action queued. Uses event_type and metadata (e.g. journal_signal). Empty state: "No behavioural events yet. Save an entry with Structured + governance to see updates." |
| `MetricsStrip` | Four cards: Identity stability %, Focus strength, Discipline state, Drift risk. Values derived from governance + connectionDepth. Hover elevation, border colour by band. |

---

## Event mapping logic

**File:** `lib/journal/mapJournalToEvents.ts`

- **Input:** `userId`, `enrichment` (JournalEnrichmentPayload: loops, distortions, themes, traits, etc.), optional `subjectCode` (governance subject_code).
- **Behaviour:**  
  - For each non-empty category (loops, distortions, themes, traits), calls `recordEvent(userId, "scheduler_tick", subjectCode, undefined, metadata)` with allowlisted metadata:  
    - `journal_signal`: "loop" | "distortion" | "theme" | "trait"  
    - `journal_code`: allowlisted code (e.g. avoidance_loop, catastrophising, identity_self_worth) or sanitized string (max 50 chars, alphanumeric + underscore)  
    - `severity`: 1–5 from signal count heuristic  
  - No raw user text is stored; only these codes and numbers.  
  - After recording events, calls `computeGovernanceState(userId)` so governance_state reflects new signals.
- **Allowlisted codes:** Loops, distortions, and themes use fixed maps (e.g. "Avoidance loop" → "avoidance_loop"); traits use sanitized first trait label.
- **API integration:** POST/PUT /api/journal with `processingMode: "signals_and_governance"` and enrichment present triggers `mapJournalToEvents` after DB create/update.

---

## UX design rationale

- **Behavioural command centre:** Single page, no diary narrative. Emphasis on domain, processing mode, live signals, impact, and reaction feed.
- **Minimalist, enterprise-grade:** 2xl rounded cards, soft shadows, 8px spacing rhythm, clear typographic hierarchy. No emotional copy; labels are neutral (e.g. "Detected patterns", "Projected impact", "System reaction feed").
- **Consent explicit:** Three-way processing mode is always visible and sent to the API; private prevents extraction; structured + governance triggers event recording and state recompute.
- **Real data only:** Live preview from /api/journal/preview (deterministic). Metrics and impact from /api/journal/console (governance + state + events). Empty states: "No behavioural signals detected yet" and "No behavioural events yet" — no placeholder or mock content.
- **Responsive:** Grid collapses on mobile (stacked); metrics strip 2x2 then 4 columns on md.
- **Micro-motion:** Framer Motion for section entry, list item stagger, hover elevation on metric cards, and preview badge appearance.

---

## Metadata-only compliance

- **Server storage:** Unchanged. `journal_entries_v2` remains metadata-only (no title/content). Enrichment is not persisted; only returned in API response and, when mode is signals_and_governance, converted to behaviour_events via allowlisted codes.
- **mapJournalToEvents:** Writes only to `behaviour_events` with `event_type: "scheduler_tick"` and metadata keys `journal_signal`, `journal_code`, `severity` (all allowlisted or numeric). No user text. `computeGovernanceState` reads events and writes only to `governance_state` (state_json).
- **Console API:** GET /api/journal/console returns governance state, behavioural state (progress, connection_depth), and recent events (id, event_type, occurred_at, subject_code, metadata). No journal content.
- **Preview API:** POST /api/journal/preview accepts text in body for extraction only; returns only arrays of strings (loops, distortions, themes, traits). No persistence.

---

## Confirmation

- **Backend preserved:** /api/journal GET/POST/PUT/PATCH unchanged in contract; added optional body fields. All lib/journal/* enrichment, governance engines, focus engine, state engine, behaviour_events unchanged except integration of mapJournalToEvents from the journal route.
- **Journal Insights tab removed:** No embedded Insights tab; journal is input + instrumentation only. Global Insights page remains separate.
- **No mock data:** All metrics, impact, and reaction feed come from governance_state, behavioural_state_current, and behaviour_events. Live preview from real extraction. Empty states are explicit copy, not fake cards.
