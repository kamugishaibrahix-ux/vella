# Resolution Journal — Rebuild Summary

**Mode:** Frontend UX only. No backend logic changed. No intelligence exposed in UI.

---

## File tree diff

### Deleted (removed from page and codebase)

| File | Description |
|------|-------------|
| `app/components/journal/IntentSelector.tsx` | Optional “What is this about?” pills (Decision, Problem, Goal, Reflection, Unclear). |
| `app/components/journal/RotatingPrompt.tsx` | Single rotating micro-prompt above text area. |
| `app/components/journal/WritingSurface.tsx` | Single/binary structured textarea with “Structured view” toggle. |

### New

| File | Description |
|------|-------------|
| `app/components/journal/ResolutionJournalForm.tsx` | Three fixed sections: What’s happening, What’s really going on, What will I do next. Save disabled until “What will I do next” is non-empty. Save shows “Logged.” with subtle fade. |

### Modified

| File | Change |
|------|--------|
| `app/components/journal/EntryHistory.tsx` | Now takes `ResolutionEntry[]` (id, date, whatsHappening, whatsReallyGoingOn, whatWillIDoNext). Renders date, first 1–2 lines of “What’s happening”, and “What will I do next” with subtle highlight (accent + border above). No tags, metrics, or badges. |
| `app/components/journal/index.ts` | Exports only `ResolutionJournalForm`, `EntryHistory`, and `ResolutionEntry`. Removed IntentSelector, RotatingPrompt, WritingSurface, JournalIntent, JournalEntryRecord. |
| `app/journal/page.tsx` | Replaced with Resolution Journal: header (Journal + date), headline “What needs clarity right now?”, single `ResolutionJournalForm`, then `EntryHistory`. Draft and entries stored in localStorage only (`vella_resolution_journal_draft`, `vella_resolution_journal_entries`). No intent, prompts, or toggles. |

---

## List of removed components

1. **IntentSelector** — Removed and file deleted.
2. **RotatingPrompt** — Removed and file deleted.
3. **WritingSurface** — Removed and file deleted (including structured/single toggle).

Removed from page only (no longer used anywhere):

- Intent selector UI
- Rotating prompts
- Structured-view toggle
- Any analytics-style or intelligence preview UI
- Consent selector UI
- Insights tab (was already removed in a prior step)

---

## List of new components

| Component | Purpose |
|-----------|---------|
| **ResolutionJournalForm** | Default writing structure: three labelled sections (What’s happening, What’s really going on, What will I do next). Placeholders as specified. Save button bottom-right; disabled when “What will I do next” is empty. On save: brief “Saving…”, then “Logged.” with subtle fade (Framer Motion). No summary, insights, or backend data. |

**Updated component**

| Component | Change |
|-----------|--------|
| **EntryHistory** | Accepts `ResolutionEntry[]`. For each entry: date, first 1–2 lines of `whatsHappening`, then `whatWillIDoNext` in a subtly highlighted line (accent color, top border). Grouped by week. No tags, metrics, or signal badges. |

---

## Design and behaviour

- **Layout:** Centered `max-w-2xl`, generous vertical spacing (8px scale), clean background, mobile-first.
- **Header:** “Journal” (left), current date (right, small). No icons or metrics.
- **Headline:** “What needs clarity right now?” below header, calm weight.
- **Form:** Three sections only. Labels: WHAT’S HAPPENING, WHAT’S REALLY GOING ON, WHAT WILL I DO NEXT. No toggles; this structure is the only mode.
- **Save:** Single “Save” control; disabled until “What will I do next” has content. No error popups. On success: “Logged.” with subtle fade.
- **History:** Entries grouped by week; card shows date, context preview (first 1–2 lines of “What’s happening”), and “What will I do next” highlighted. Rounded cards, soft shadow, neutral palette.
- **Tone:** Focused, deliberate, modern. No emojis, no playful copy. No governance, events, metrics, or backend engines in UI.

---

## Confirmation: no backend intelligence in UI

- **Governance state:** Not read or displayed.
- **Behaviour events:** Not read or displayed.
- **Metrics / percentages:** None (no risk, focus, discipline, drift, etc.).
- **Backend engines:** Not referenced in UI or copy.
- **Smart detection / insights:** No live detection, no insights, no summaries, no signals.
- **Data source:** Draft and entries are stored and read only from localStorage (`vella_resolution_journal_draft`, `vella_resolution_journal_entries`). No API calls from this page.
- **Entry shape:** Only date and the three resolution fields (what’s happening, what’s really going on, what will I do next) are shown. No tags, scores, or badges.

The Resolution Journal is a clarity-only, frontend-only tool with no backend intelligence exposed.
