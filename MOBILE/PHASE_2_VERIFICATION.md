# Phase 2 — Verification

**Purpose:** Track metrics before/after decoupling and smoke-test checklist. Update after each extraction step.

---

## Metrics (after extractions)

| Surface | Fetch Count Before | After | useEffect Before | After |
|---------|--------------------|-------|-------------------|-------|
| Home (HomeClientPage) | 4 | 0 | 6 | 0 |
| Insights (page) | 8+ | 0 | 9 | 0 |
| Profile (page) | 0 | 0 | 2 | 0 |
| Session (page) | 3+ | 0 (direct) | 24 | 22 |

**Notes:** Home, Insights, and Profile now delegate all fetch/useEffect to hooks (useHomeDashboard, useInsightsDashboard, useProfileController). Session delegates policy fetch, vella/text, pattern-insight, and history load/save to useSessionOrchestrator; the page retains 22 useEffects for realtime, audio, voice mode, and UI sync.

---

## Smoke Test Checklist

- [ ] Home loads without console errors
- [ ] Session can send/receive message (text and voice path)
- [ ] Insights loads data (all cards/sections)
- [ ] Journal still renders
- [ ] Profile sign-in/out works
- [x] Build passes (`pnpm run build`)

---

## Notes

- Phase 2 decoupling complete. Hooks own business logic and data fetching; pages render from hook data/actions.
- Phase 3 starts only when all criteria in PHASE_2_DECOUPLING_PLAN.md are met (build passes, no behaviour change).
