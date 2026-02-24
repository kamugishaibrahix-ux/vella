# Journal Refinement — Flow Surface, Consent, Keywords, Header History

**Mode:** UX-only. No backend analytics exposed. No dashboards. No governance panels.

---

## File tree diff

### New files

| File | Purpose |
|------|--------|
| `lib/journal/journalKeywords.ts` | Client-side deterministic keyword patterns (loops, distortions, themes, value, commitment) for highlight when consent enabled. `findKeywordRanges`, `segmentTextForHighlight`. |
| `app/components/journal/HighlightedTextarea.tsx` | Textarea with optional keyword highlighting; when `highlight` is true, mirrors content into a layer with soft underline/background on matched stems. |

### Modified files

| File | Changes |
|------|--------|
| `app/components/journal/ResolutionJournalForm.tsx` | Flow layout: borderless sections, subtle bottom border on focus only; labels "What's happening?", "What's really going on?", "What's one step forward?" (smaller, lighter, normal case). Clarity pills at top ("How clear do you feel right now?" — Clouded / Mixed / Clear), local only. Consent checkbox below writing ("Allow Vella to learn from this entry" + subtext). Keyword highlighting in all three fields when consent enabled. Save copy: "Saved." vs "Clarity logged." via `savedWithConsent` prop. |
| `app/components/journal/index.ts` | Exports `ClarityLevel`, `HighlightedTextarea`. |
| `app/journal/page.tsx` | Draft extended with `clarity` and `allowVellaToLearn` (persisted in localStorage). Header: left "Journal", right "History" button. History opens slide-over panel (animated) with `EntryHistory`; empty state "No entries yet." On save with consent: POST `/api/journal` with `processingMode: "signals_and_governance"` and combined text; then append to local entries and show "Clarity logged." Without consent: local save only, show "Saved." |

### Unchanged

- `app/components/journal/EntryHistory.tsx` — still used in history panel; no metrics/signals.
- Backend `/api/journal`, `lib/journal/*` (server, mapJournalToEvents, enrichment) — no changes. No analytics or governance state exposed in UI.

---

## List of updated components

| Component | Updates |
|-----------|--------|
| **ResolutionJournalForm** | Clarity pills (local), borderless flow sections, conversational labels, consent checkbox + subtext, `HighlightedTextarea` with highlight when consent on, Save copy by `savedWithConsent`. |
| **HighlightedTextarea** (new) | Optional keyword highlight layer; soft underline + tint; used for all three journal fields when consent enabled. |
| **Journal page** | Draft includes clarity + consent; header History button; slide-over history panel; save with optional API call when consent on. |

---

## Confirmation

### Consent flag wired

- Checkbox "Allow Vella to learn from this entry" (default unchecked).
- When checked and user saves: POST to `/api/journal` with `text` (combined three sections) and `processingMode: "signals_and_governance"`.
- Backend runs deterministic extraction and stores structured codes; no raw text or analytics shown in UI.

### Keyword highlighting active only when consent enabled

- `HighlightedTextarea` receives `highlight={allowVellaToLearn}`.
- Patterns in `journalKeywords.ts` align with backend concepts (loops, distortions, themes, value/commitment stems).
- Soft underline and subtle background tint; no popups or tooltips. Highlighting off when consent unchecked.

### History accessible via header

- Header right: "History" button.
- Opens slide-over panel (right side) with entries grouped by week, date, first 1–2 lines of context, highlighted "step forward" line.
- No metrics, signals, or backend state in history.

### No backend intelligence exposed

- No governance state, behaviour events, risk levels, or extracted signal list in UI.
- No insights section, analytics visuals, or monitoring console.
- Clarity pills and consent are local/API-only; no dashboards or reaction feeds.

---

Phase one journal refinement complete.
