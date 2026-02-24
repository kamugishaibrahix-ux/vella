# Journal History — Side Sheet to Full-Screen Route

**Mode:** Mobile-first. No drawers, overlays, or split layout.

---

## File tree diff

### New

| File | Purpose |
|------|--------|
| `app/journal/history/page.tsx` | Full-screen Journal History route. Header: ← Back (router.back()), center "Journal History", right empty. Main: load entries from localStorage; empty state "No entries yet." or EntryHistory (grouped by week, date, preview, highlighted step forward). No analytics, signals, or overlays. |

### Modified

| File | Changes |
|------|--------|
| `app/journal/page.tsx` | Removed: `historyOpen` / `setHistoryOpen`, `AnimatePresence`, overlay div, fixed slide-over panel, all conditional history UI. History button now calls `router.push('/journal/history')`. Removed imports: `motion`, `AnimatePresence`, `EntryHistory`. Added: `useRouter` from `next/navigation`. |

### Deleted (side-sheet implementation)

- **No separate component file** was used for the sheet; the panel was inline in `app/journal/page.tsx`.
- **Removed from `app/journal/page.tsx`:**
  - State: `historyOpen`, `setHistoryOpen`
  - `<AnimatePresence>` and its children
  - Overlay: `motion.div` with `fixed inset-0 bg-black/20 z-40` and click-to-close
  - Slide panel: `motion.div` with `fixed inset-y-0 right-0`, header ("Journal history" + Close), and scrollable `EntryHistory` / empty state

---

## Confirmation

### History is full page

- Route: `/journal/history`
- Single full-screen layout: header + scrollable main
- No sheet, drawer, dialog, or portal

### No overlay exists

- No dim background, no blur, no fixed overlay
- Navigation is by route only

### Mobile navigation

- Journal page: "History" → `router.push('/journal/history')`
- History page: "← Back" → `router.back()`
- No modals or in-page panels

### No console errors

- Lint clean on `app/journal/page.tsx` and `app/journal/history/page.tsx`
- No unused imports; no overlay/sheet CSS left on journal page

---

Optional: clear `.next` and restart dev server if you see stale UI: `rm -rf .next` then `pnpm dev` (or equivalent).
