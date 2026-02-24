# Phase 5 — Design System (Design Tokens & UI Primitives)

Structural enhancement only. No layout redesign, no navigation changes, no feature removal.

---

## 1. Typography scale

### Explicit type scale (Tailwind)

| Class     | Size    | Line height |
|-----------|---------|-------------|
| `text-xs` | 0.75rem | 1rem        |
| `text-sm` | 0.875rem| 1.25rem     |
| `text-base` | 1rem  | 1.5rem      |
| `text-lg` | 1.125rem| 1.75rem     |
| `text-xl` | 1.25rem | 1.75rem     |
| `text-2xl`| 1.5rem  | 2rem        |
| `text-3xl`| 1.875rem| 2.25rem     |
| `text-4xl`| 2.25rem | 2.5rem      |

Defined in `tailwind.config.ts` under `theme.extend.fontSize`.

### Semantic classes (globals.css)

| Class         | Mapping                          | Use |
|---------------|-----------------------------------|-----|
| `.vella-h1`   | text-3xl, font-semibold, primary  | Page title |
| `.vella-h2`   | text-2xl, font-semibold, primary  | Section title |
| `.vella-h3`   | text-xl, font-semibold, primary   | Card/subsection title |
| `.vella-body` | text-base, primary                | Body copy |
| `.vella-caption` | text-xs, secondary, uppercase, tracking | Labels, overlines |

### Legacy aliases (do not remove)

- `.mctitle` → same as `.vella-h2` (text-2xl, font-semibold, primary).
- `.mcsubtitle` → same as `.vella-caption` (text-xs, secondary, uppercase).
- `.mctext` → text-base, primary, leading relaxed.

---

## 2. Spacing scale

Official increments (use these for new work and when refactoring):

| Token   | Value | Tailwind |
|---------|-------|----------|
| 4px     | 0.25rem | `1`   |
| 8px     | 0.5rem  | `2`   |
| 12px    | 0.75rem | `3`   |
| 16px    | 1rem    | `4`   |
| 24px    | 1.5rem  | `6`   |
| 32px    | 2rem    | `8`   |
| 48px    | 3rem    | `12`  |

Use `p-*`, `px-*`, `py-*`, `gap-*`, `mt-*`, `mb-*` etc. from this scale (1, 2, 3, 4, 6, 8, 12). No requirement to refactor every file in Phase 5; standardise as you touch components.

---

## 3. Colour tokens

### Semantic variables (globals.css)

| Token | Purpose |
|-------|---------|
| `--vella-bg-primary` | Page / app background |
| `--vella-bg-surface` | Panels, bars |
| `--vella-bg-elevated` | Cards, modals, inputs |
| `--vella-text-primary` | Primary text |
| `--vella-text-secondary` | Muted, captions |
| `--vella-accent-primary` | Primary actions, links |
| `--vella-accent-danger` | Errors, destructive actions |
| `--vella-border-subtle` | Light borders |
| `--vella-border-default` | Default borders |

Legacy `--mc-*` variables are mapped from these where applicable. Dark mode is active. A `.light` theme scaffold exists under `:root.light` but is not enabled.

---

## 4. Elevation

Two levels only:

| Class | Token | Use |
|-------|--------|-----|
| `.vella-surface` | `--vella-elevation-surface` | Cards, default raised surface |
| `.vella-elevated` | `--vella-elevation-elevated` | Modals, popovers, stronger lift |

Tailwind: `shadow-soft` = surface, `shadow-elevated` = elevated. Replace ad‑hoc shadows with these where appropriate.

---

## 5. Button system

- **Component:** `components/ui/Button.tsx`.
- **Sizes:** `sm` (h-10), `md` (h-12), `lg` (h-14).
- **Variants:** `primary` | `secondary` | `ghost` | `danger`.
- **Colour:** Uses semantic tokens only (no inline hex). Primary uses `--mc-primary-dark` / `--mc-primary-soft` (legacy); others use `--vella-*` or `--mc-*` tokens.
- **No inline colour classes** on Button; variants are defined in the component.

### Violations (inline bg-/text-/border- not using tokens)

Documented for future cleanup. Prefer tokens (e.g. `text-[color:var(--vella-text-primary)]`, `bg-[color:var(--vella-accent-danger)]`) or semantic classes.

| File | Example | Note |
|------|---------|------|
| app/settings/account-plan/page.tsx | `text-white`, `text-white/60`, `border-white/5`, `bg-rose-500/5`, `text-rose-100`, `text-gray-300` | Replace with vella/mc tokens where possible |
| components/journal/JournalPageClient.tsx | `text-rose-300` | Error text → `--vella-accent-danger` or muted |
| components/home/HomeClientPage.tsx | `border-rose-500/30`, `bg-rose-500/10`, `text-rose-100`, `text-white` | Alerts / CTAs |
| app/profile/page.tsx | `text-white`, `text-black` | Hero / badges |
| app/insights/page.tsx | `text-white/80`, `text-white/60`, `text-rose-100`, `border-rose-500/40` | Cards, errors |
| app/session/page.tsx | `text-white`, `bg-black/40`, `border-red-500/20`, `bg-red-500/10`, `text-red-600` | Overlay, errors |
| app/check-in/page.tsx | `text-rose-100`, `text-white` | Alerts, CTA |
| app/timeline/page.tsx | `text-rose-100`, `border-rose-400/40` | Errors |
| app/growth-plan/page.tsx | `text-rose-100`, `text-blue-400` | Alerts, links |
| app/connection-index/page.tsx | `text-pink-300` | Icon |
| components/home/QuickActionCard.tsx | `text-pink-400`, `text-pink-200`, `text-pink-100`, `text-blue-300` | Icons |
| components/layout/BottomNav.tsx | `text-white`, `bg-[rgba(...)]` | Nav bar |
| app/distortions, themes, loops, forecast-center, growth-roadmap, regulation, identity, session-insights/page.tsx | `text-rose-300` | Error message strip |

---

## 6. Input standardisation

- **Component:** `components/ui/Input.tsx`.
- **Props:** Standard input props plus `inputSize?: 'sm' | 'md' | 'lg'`, `error?: boolean` (avoid `size` to prevent clash with HTML attribute).
- **Styling:** Uses `--vella-bg-elevated`, `--vella-text-primary`, `--vella-text-secondary`, `--vella-border-default`, `--vella-accent-primary`, `--vella-accent-danger` (for error state). No hardcoded colours.

### Raw `<input>` / `<textarea>` (migrate later)

| Location | Type | Can migrate to |
|----------|------|-----------------|
| app/settings/account-plan/page.tsx | checkbox | Input (or keep as custom checkbox) |
| app/profile/page.tsx | text | Input |
| app/compass-mode/page.tsx | textarea | Token-styled Textarea (to be added) |
| app/check-in/page.tsx | textarea | Token-styled Textarea |
| app/onboarding/reason/page.tsx | textarea | Token-styled Textarea |
| app/onboarding/privacy/page.tsx | checkbox | Keep or custom |
| app/onboarding/name/page.tsx | text | Input |
| components/settings/VellaSettingsCard.tsx | radio, checkbox | Keep or custom |
| components/settings/ReportIssueModal.tsx | textarea | Token-styled Textarea |
| components/settings/FeedbackModal.tsx | textarea | Token-styled Textarea |
| components/journal/JournalEditor.tsx | textarea | Token-styled Textarea |
| components/chat/ChatPanel.tsx | textarea | Token-styled Textarea |
| components/check-in/CheckInSliders.tsx | range | Keep (range input) |

No refactor of all of these in Phase 5; document only.

---

## 7. Summary

- **Typography:** Scale in Tailwind; semantic classes in globals; legacy `.mctitle` / `.mcsubtitle` / `.mctext` preserved.
- **Spacing:** 4–48px scale documented; use 1,2,3,4,6,8,12 in Tailwind.
- **Colour:** `--vella-*` semantic tokens; `--mc-*` kept and mapped where appropriate; light scaffold present.
- **Elevation:** `.vella-surface`, `.vella-elevated`; `shadow-soft` / `shadow-elevated`.
- **Button:** Sizes sm/md/lg; variants primary/secondary/ghost/danger; token-only colours.
- **Input:** `Input.tsx` created; raw inputs/textareas listed for later migration.
