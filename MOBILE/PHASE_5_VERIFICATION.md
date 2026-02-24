# Phase 5 Design System — Verification Checklist

---

## Build & styles

- [ ] **App builds** — `pnpm run build` passes (from `MOBILE/`).
- [ ] **No broken styles** — Key pages (home, journal, settings, timeline) render without missing or wrong visuals.
- [ ] **No removed class names** — `.mctitle`, `.mcsubtitle`, `.mctext` still work (aliased to new scale).
- [ ] **Button still renders correctly** — All variants (primary, secondary, ghost, danger) and sizes (sm, md, lg) look correct.
- [ ] **Typography classes compile** — `.vella-h1`–`.vella-caption` and `text-xs`–`text-4xl` apply without Tailwind errors.
- [ ] **No Tailwind config errors** — No console or build errors from `tailwind.config.ts`.

---

## Completion criteria

Phase 5 is complete only if:

- Typography scale defined (Tailwind + semantic classes).
- Spacing scale defined and documented.
- Colour tokens formalised (`--vella-*`, `:root.light` scaffold).
- Elevation system defined (`.vella-surface`, `.vella-elevated`).
- Button system constrained (sizes, variants, token-only).
- Input component created (`components/ui/Input.tsx`).
- Build passes.
- Documentation exists (`PHASE_5_DESIGN_SYSTEM.md`, this file).

Do not redesign Home. Do not change layout. Do not modify copy.
