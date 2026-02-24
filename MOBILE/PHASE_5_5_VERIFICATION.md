# Phase 5.5 — Token & Shadow Enforcement Verification

## Checklist

- [ ] **Build passes** — `pnpm run build` (from `MOBILE/`).
- [ ] **No inline colour utilities remain** (except spacing/layout) — no `text-white`, `text-rose-*`, `bg-black/40`, etc.
- [ ] **Only --vella-* tokens used in UI** — no `var(--mc-*)` in component classNames (tailwind theme may still reference mc internally).
- [ ] **Only two shadow levels used** — `shadow-soft` and `shadow-elevated` only; no custom `shadow-[...]`.
- [ ] **Button still renders correctly** — primary, secondary, ghost, danger.
- [ ] **Inputs render correctly** — `Input` component and existing text inputs.

## Completion requirements

Do not proceed to Phase 6 until:

- No Tailwind colour utilities remain (rose, pink, blue, white, black, gray except token-based).
- No --mc-* used in components.
- Only semantic tokens used.
- Build passes.
