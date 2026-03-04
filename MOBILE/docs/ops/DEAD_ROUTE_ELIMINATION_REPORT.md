# Dead Route Elimination — API Usage Report

**Generated:** 2025-03-01  
**Scope:** `app/`, `components/`, `lib/`, `hooks/` scanned for `fetch("/api/...")` and `useSWR("/api/...")`.  
**Excluded:** `.next/`, `node_modules/`, build artifacts.

---

## 1. Used routes (have at least one fetch/useSWR caller)

| Route | Caller(s) |
|-------|------------|
| `/api/session/confirm-contract` | app/session/page.tsx, app/session/voice/page.tsx, app/inbox/page.tsx |
| `/api/vella/text` | app/session/page.tsx, app/home/components/TodayGreeting.tsx, app/home/components/GovernanceHero.tsx, components/GreetingSection.tsx |
| `/api/journal` | app/journal/page.tsx (useSWR + fetch POST), app/journal/history/page.tsx (useSWR), app/journal/[id]/page.tsx |
| `/api/account/entitlements` | app/components/providers/EntitlementsProvider.tsx, hooks/useEntitlements.ts |
| `/api/account/token-balance` | app/components/providers/TokenBalanceProvider.tsx, hooks/useTokenBalance.ts |
| `/api/stripe/create-checkout-session` | app/profile/upgrade/page.tsx, components/UpgradeModal.tsx |
| `/api/stripe/portal` | app/profile/upgrade/page.tsx, components/UpgradeModal.tsx |
| `/api/stripe/topups/create-checkout-session` | app/profile/upgrade/page.tsx, components/UpgradeModal.tsx |
| `/api/connection-index` | lib/connection/getConnectionIndex.ts, lib/home/deriveHomeState.ts |
| `/api/commitments/list` | app/commitments/page.tsx, app/commitments/[id]/page.tsx, lib/execution/scheduler.ts, lib/home/deriveHomeState.ts |
| `/api/commitments/outcome` | app/commitments/[id]/page.tsx, app/inbox/page.tsx |
| `/api/commitments/status` | app/commitments/[id]/page.tsx |
| `/api/commitments/create` | app/commitments/create/page.tsx |
| `/api/checkin/contracts` | app/session/page.tsx, app/checkin/page.tsx |
| `/api/check-ins` | app/home/components/DailyCheckInPrompt.tsx, app/home/components/GovernanceHero.tsx, components/CheckInSection.tsx |
| `/api/governance/state` | app/home/components/GovernanceHero.tsx, components/CommitmentSection.tsx |
| `/api/inbox` | app/inbox/page.tsx |
| `/api/reflection` | lib/ai/reflectionClient.ts |
| `/api/execution/trigger/log` | lib/execution/scheduler.ts |
| `/api/execution/trigger/suppressed` | lib/execution/scheduler.ts |
| `/api/emotion-memory` | lib/realtime/useRealtimeVella.ts |
| `/api/audio/vella` | lib/realtime/useRealtimeVella.ts |
| `/api/migration/start` | lib/migration/client/importPipeline.ts |
| `/api/migration/complete` | lib/migration/client/importPipeline.ts |
| `/api/migration/status` | lib/migration/client/status.ts |
| `/api/migration/export/journals` | lib/migration/client/importPipeline.ts (URL constant) |
| `/api/migration/export/checkins` | lib/migration/client/importPipeline.ts (URL constant) |
| `/api/migration/export/conversations` | lib/migration/client/importPipeline.ts (URL constant) |
| `/api/migration/export/reports` | lib/migration/client/importPipeline.ts (URL constant) |
| `/api/insights/patterns` | lib/insights/requestPatternsClient.ts, lib/insights/patterns.ts |
| `/api/insights/generate` | lib/insights/growthRoadmap.ts |
| `/api/insights/snapshot` | app/insights/page.tsx (useSWR) |
| `/api/state/current` | lib/home/deriveHomeState.ts |
| `/api/system/health` | lib/home/deriveHomeState.ts |
| `/api/realtime/offer` | lib/realtime/realtimeClient.ts |
| `/api/stripe/webhook` | **External** — Stripe server-to-server |

---

## 2. Unused routes (no fetch/useSWR in app, components, lib, hooks)

| Route | Notes | Safe to delete? |
|-------|--------|------------------|
| `/api/realtime/token` | No caller; realtime client uses `/api/realtime/offer` only. | **Yes** |
| `/api/account/plan` | Plan read via entitlements/subscriptions elsewhere; no direct fetch. | Keep (likely used by settings/plan UI or future) |
| `/api/account/export` | Profile export is local-only; API exists for server export. | Keep (GDPR/export feature) |
| `/api/account/delete` | Profile delete is local-only; API exists for account deletion. | Keep (GDPR/delete feature) |
| `/api/vella/session/close` | Only referenced in tests. | Keep (session end flow) |
| `/api/state/recompute` | No caller in scanned code. | Keep (state refresh flow) |
| `/api/state/history` | No caller in scanned code. | Keep (history UI) |
| `/api/behavioural-state` | Deprecated (use `/api/state/current`); may have legacy clients. | Keep (backward compat) |
| `/api/focus/week` | Only in tests. | Keep (focus feature) |
| `/api/focus/week/review` | Only in tests. | Keep (review feature) |
| `/api/check-ins/weekly-focus` | Only in tests. | Keep (weekly focus feature) |
| `/api/journal/preview` | No caller in scanned code. | Keep (journal preview) |
| `/api/journal/console` | No caller in scanned code. | Keep (console/debug) |
| `/api/journal-themes` | No direct fetch; may be used by insights. | Keep |
| `/api/reports/create` | No caller in scanned code. | Keep (reports feature) |
| `/api/feedback/create` | No caller in scanned code. | Keep (feedback feature) |
| `/api/admin/analytics/overview` | Admin UI. | Keep |
| `/api/admin/subscribers` | Admin UI. | Keep |
| `/api/admin/user/[id]/metadata` | Admin UI. | Keep |
| `/api/admin/user/[id]/suspend` | Admin UI. | Keep |
| `/api/internal/governance/daily` | Likely cron/background. | Keep |
| `/api/internal/migration/audit` | Internal tool. | Keep |
| `/api/internal/migration/purge` | Internal tool; tests reference. | Keep |
| `/api/inbox/proposals` | Server-side sync; tests reference. | Keep |
| Legacy AI routes (architect, clarity, strategy, compass, deepdive, emotion-intel, deep-insights, growth-roadmap, transcribe, identity, roadmap, forecast, prediction, pattern-insight, loops, behaviour-loops, connection-depth, strengths-values, themes, traits, cognitive-distortions, distortions, goals, progress, regulation, regulation-strategies, weekly-review) | In routeRegistry; may be invoked from vella/text or other server flows. | Keep |

---

## 3. Action taken

- **Deleted:** `/api/realtime/token` — no callers; realtime uses `/api/realtime/offer` only. Removed route file and references in `lib/security/routeRegistry.ts`, `lib/security/rateLimit/config.ts`, `lib/security/aiEndpointPolicy.ts` (if present).
- **No other routes deleted** — all other unused routes are retained for admin, internal, cron, GDPR, or future use.

---

## 4. Verification

After deletion: run `npm run build` and fix any type/lint errors. `link.d.ts` will regenerate on build.
