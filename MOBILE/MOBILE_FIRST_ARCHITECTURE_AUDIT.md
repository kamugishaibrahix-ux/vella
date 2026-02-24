# Mobile-First & Tablet-Secondary Architecture Audit (Strict)

**Mode:** Read-only, evidence-based.  
**Date:** Audit run against current codebase.

---

## STEP 1 — GLOBAL WIDTH CONTROL

### Scanned
- `app/layout.tsx`
- Root layout (no other root layout files found)
- `MobileShell` wraps `{children}` inside layout div

### Evidence

| Item | Location | Finding |
|------|----------|---------|
| Width constrained | `app/layout.tsx` line 33 | Single div: `className="w-full max-w-md md:max-w-lg min-h-screen relative"` |
| max-w-* global | `app/layout.tsx` line 33 | `max-w-md md:max-w-lg` on the single inner div only |
| Width in more than one place | — | Layout is the only place with max-width on the app shell. Other max-w-* are on modals/sheets/components (see Step 2). |
| justify-center + max-w pattern | `app/layout.tsx` lines 31, 33 | `body`: `flex justify-center`; inner div: `max-w-md md:max-w-lg` |
| w-screen / min-w-screen at root | — | None on body or layout wrapper. No `w-screen` or `min-w-screen` in layout. |

### Verdict
- **Single width owner?** **YES** — One div in layout defines width; comment on line 32 states "Single width controller".
- **Mobile constrained?** **YES** — `max-w-md` (28rem) default, `md:max-w-lg` (32rem) tablet; no larger breakpoints.

---

## STEP 2 — PAGE ROOT STRUCTURE

### /home
- **File:** `app/home/page.tsx`, `app/home/page.module.css`
- **Root structure:** `<div className={styles.viewport}>` → `<div className={styles.shell}>` → content + BottomNav.
- **CSS:** `.shell`: `width: 100%`; no `max-width` or `margin` (removed in prior change). `.viewport`: `height: 100dvh`, flex, no width.
- **max-w-*:** None at page root.
- **container:** Not used.
- **w-screen:** Not used.
- **Re-center content:** `.content` has `justify-content: space-between` (vertical), not horizontal centering.
- **Flex override:** Shell is flex column; inherits layout width.
- **Verdict:** **Layout compliant? YES.** **Causes width drift? NO.**

### /checkin
- **File:** `app/checkin/page.tsx`
- **Root:** `<div className="min-h-[100dvh] overflow-y-auto pb-24 flex flex-col">` (line 267).
- **max-w-* / container / w-screen:** None at root.
- **Re-center:** No root-level centering.
- **Verdict:** **Layout compliant? YES.** **Causes width drift? NO.**

### /session
- **File:** `app/session/page.tsx`
- **Root:** `<div className="flex flex-col h-dvh bg-vella-bg">` (line 221).
- **max-w-* at root:** None. Modal (line 56): `max-w-sm` on dialog content. Message bubbles (267, 277): `max-w-[85%]` for bubble width. Input bar (298–299): `sticky bottom-20 w-full` and inner `w-full` (no max-w/mx-auto at root).
- **Close button:** Line 342 — `fixed bottom-4 left-1/2 -translate-x-1/2` (viewport-centered; not layout-width constrained).
- **container / w-screen:** Not used at root.
- **Verdict:** **Layout compliant? YES** (page root and input bar respect layout). **Causes width drift? NO** (close button is visual only; content width is constrained).

### /journal
- **File:** `app/journal/page.tsx`
- **Root:** `<div className="min-h-[100dvh] overflow-y-auto pb-24">` → `<div className="px-5 py-6 space-y-6">` (lines 377–378).
- **max-w-* / container / w-screen:** None at page root.
- **Verdict:** **Layout compliant? YES.** **Causes width drift? NO.**

### /insights
- **File:** `app/insights/page.tsx`
- **Root:** Fragment → `AppHeader` → optional mock banner → `<main className="pb-8 pt-2">` (lines 192–199).
- **max-w-* / container / w-screen:** None at root. Empty state (line 151): `flex ... items-center justify-center` inside component, not page root.
- **Verdict:** **Layout compliant? YES.** **Causes width drift? NO.**

### Non-tab pages (evidence only)
- **Journal history** (`app/journal/history/page.tsx`): Root `min-h-[100dvh] overflow-y-auto pb-24`, inner `px-5 py-6 space-y-6`. No width logic. Compliant.
- **Vella-voice** (`app/vella-voice/page.tsx` line 5): `h-screen` + `flex ... items-center justify-center` — full-screen centering; not a main tab.

### Components that introduce max-w / mx-auto (not page roots)
- `app/components/weekly-focus/InfoSheet.tsx` line 39–40: `fixed bottom-0 left-0 right-0` + `max-w-[430px] mx-auto` — sheet modal; can cause visual width constraint in overlay.
- `app/components/journal/EntryComparisonModal.tsx` line 31: `max-w-[430px]` on modal content.
- `app/journal/journal.module.css` lines 4–7: `.container { max-width: 672px; margin: 0 auto; }` — **not imported** anywhere in app (grep); dead or legacy.

---

## STEP 3 — RESPONSIVE BREAKPOINT USAGE

### Evidence (grep: sm:, md:, lg:, xl:, 2xl: in TSX/CSS)

| File | Line | Usage |
|------|------|--------|
| `app/layout.tsx` | 33 | `md:max-w-lg` — tablet: slightly wider container |
| `app/components/AppHeader.tsx` | 62 | `text-3xl md:text-4xl` — tablet: larger greeting |
| `app/components/weekly-focus/ReviewPanel.tsx` | 28 | `grid-cols-1 sm:grid-cols-2` — small+: 2-column grid for two cards |
| `app/components/weekly-focus/CompletionRing.tsx` | 19–20 | Size config `sm`/`md` for ring dimensions (component-internal) |
| `tailwind.config.ts` | 22, 24, 25, 72 | Font size names `sm`/`lg`/`xl` and border radius `xl` (Tailwind tokens, not breakpoints) |

### Analysis
- **Scale up from mobile:** Yes — layout uses `md:max-w-lg`; AppHeader uses `md:text-4xl`; ReviewPanel uses `sm:grid-cols-2`. Base is single-column / mobile.
- **Desktop layouts:** No `lg:`, `xl:`, or `2xl:` in app UI; no desktop-first layouts.
- **Grid for large screens:** Only `grid-cols-1 sm:grid-cols-2` in ReviewPanel; no multi-column desktop grids.
- **Content stacked by default:** Yes — single column; breakpoints only refine (e.g. 2 columns for one panel).

### Verdict
- **Mobile-first pattern (base first, then md: upgrades)?** **YES**
- **Desktop-first overrides present?** **NO**

---

## STEP 4 — NAVIGATION STRUCTURE

### Evidence
- **Bottom nav placement:** `app/components/MobileShell.tsx` lines 32–35: wrapped in `<div className="sticky bottom-0 w-full z-50">`. Rendered inside layout’s width div (MobileShell is child of layout).
- **Fixed vs sticky:** **Sticky** — not `fixed`.
- **Width:** `w-full` — fills layout container; no `left-0 right-0` or viewport escape.
- **Component:** `app/components/BottomNav.tsx` — no fixed/absolute; flex with `justify-around`, `h-[80px]`, tab icons + labels.

### Verdict
- **Mobile native behaviour?** **YES** — Sticky within one width container; no viewport-wide fixed bar.

---

## STEP 5 — TYPOGRAPHY & SPACING SCALE

### Evidence
- **Large headings:** `AppHeader.tsx` line 62: `text-3xl md:text-4xl` (home greeting). Other pages: `text-xl` or `text-2xl` (session, journal, check-in, insights).
- **Excessive sizes:** No `text-5xl` or `text-6xl` in app.
- **Padding:** Journal/check-in/insights use `px-5`/`py-6` or similar. `EmptyState.tsx` line 19: `py-12 px-4`. `JournalEditor.tsx` line 40: `py-12 px-6` for drop zone. No `px-10`/`px-12` at page level; no systematic desktop-style large padding.
- **Vertical rhythm:** Single column, consistent spacing (e.g. `space-y-6`, `space-y-8`); mobile-appropriate.

### Verdict
- **Mobile density appropriate?** **YES**

---

## STEP 6 — HEIGHT MANAGEMENT

### Evidence
- **Layout:** `app/layout.tsx` line 33: `min-h-screen` on width div. Body: `min-h-screen`.
- **MobileShell:** Line 23 (session): `h-dvh flex flex-col`; line 30 (others): `min-h-screen flex flex-col`. Main: `flex-1 min-h-0 w-full flex flex-col` (and session: `overflow-hidden`).
- **Pages:**  
  - Home: CSS `.viewport`/`.shell` `height: 100dvh`, `overflow: hidden`.  
  - Check-in: `min-h-[100dvh] overflow-y-auto pb-24` (line 267).  
  - Session: `h-dvh` (line 221); messages area `flex-1 overflow-y-auto ... min-h-0` (253–254).  
  - Journal: `min-h-[100dvh] overflow-y-auto pb-24` (377).  
  - Journal history: same pattern (97); empty state `min-h-[60dvh]` (117).  
  - Vella-voice: `h-screen` (5).
- **Nested scroll:** Session has one scroll context (messages div); others use one page scroll. Home uses fixed height + overflow hidden (no inner scroll).

### Verdict
- **Mobile scroll architecture intact?** **YES** — Single primary scroll per page; no conflicting full-height stacks that break mobile scroll.

---

## STEP 7 — VIEWPORT META

### Evidence
- **Next.js App Router:** No `app/head.tsx` or `_document.tsx` (glob search). Viewport is controlled by Next.js defaults or `viewport` export in layout.
- **Layout:** `app/layout.tsx` — no `export const viewport` or viewport object. Next.js 14 sets default viewport when not overridden (typically `width=device-width, initial-scale=1`).
- **Explicit viewport export:** Grep for `viewport` / `width=device-width` in app: no custom viewport config found.

### Verdict
- **Proper mobile viewport config?** **ASSUMED YES** — No custom viewport; Next.js default applies. Explicit `export const viewport = { width: 'device-width', initialScale: 1 }` in `app/layout.tsx` would remove ambiguity.

---

## STEP 8 — FINAL VERDICT

### Architecture classification
**Strict mobile-first (with tablet-secondary)**

- One global width constraint in layout; pages do not introduce their own max-width at root.
- Base styles are mobile; `md:` (and one `sm:`) used only to scale up slightly (container, type, one grid).
- No desktop breakpoints (`lg`/`xl`/`2xl`) in UI; no desktop-optimised layout.
- Bottom nav is sticky inside the layout container; no width leak from fixed viewport-wide nav.
- Height and scroll are single-context per page; typography and spacing are mobile-appropriate.

### Key violations (minor / contained)
1. **Session close button** — `app/session/page.tsx` line 342: `fixed bottom-4 left-1/2 -translate-x-1/2` — viewport-centered; does not break content width but is not constrained to layout width.
2. **InfoSheet** — `app/components/weekly-focus/InfoSheet.tsx` lines 39–40: `fixed bottom-0 left-0 right-0` + `max-w-[430px] mx-auto` — overlay sheet re-centers and constrains width; could be aligned to layout width for consistency.
3. **journal.module.css** — `app/journal/journal.module.css` lines 4–7: `.container` with `max-width: 672px; margin: 0 auto` — not imported in app; dead/legacy; if ever used, would add a second width concept.

### Structural fixes required (recommendations only)
- Add explicit viewport export in `app/layout.tsx` (e.g. `export const viewport = { width: 'device-width', initialScale: 1 }`) for clarity and guarantee.
- Optionally: constrain session close button to layout width (e.g. wrap in same width container or use `left`/`right` within layout) so it doesn’t rely on viewport center.
- Optionally: make InfoSheet width follow layout (e.g. no `left-0 right-0`; render inside layout flow or use same max-width as layout) for consistency.
- Remove or repurpose `journal.module.css` `.container` if unused to avoid future misuse.

### Classification score (mobile integrity): **8.5 / 10**
- Deducted: no explicit viewport export (-0.25); session close button viewport-centered (-0.25); InfoSheet fixed full-width + max-w/mx-auto (-0.5); dead `.container` in CSS (-0.5).
- Strength: single width owner, compliant tab pages, mobile-first breakpoints, sticky nav, appropriate density and scroll.

---

*End of audit. No code was modified.*
