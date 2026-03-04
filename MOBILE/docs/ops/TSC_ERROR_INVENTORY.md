# TSC Error Inventory

## Command and timestamp

- **Command:** `pnpm exec tsc --noEmit --pretty false > tsc_errors.txt`
- **Generated:** 2026-03-01 (from Phase 0 run)
- **Working directory:** `c:\dev\MOBILE`

---

## FILE INDEX

| Count | File path |
|------:|-----------|
| 33 | test/guard/noTierStringLogic.test.ts |
| 22 | lib/realtime/personaSynth.ts |
| 11 | test/api/focusWeekRoute.test.ts |
| 9 | test/api/weeklyFocusCheckinRoute.test.ts |
| 6 | lib/safety/complianceFilter.ts |
| 6 | test/api/stripeCheckoutHardening.test.ts |
| 6 | test/api/migrationPurge.test.ts |
| 5 | test/plans/featureRegistry.test.ts |
| 5 | test/memory/consolidation.test.ts |
| 5 | test/api/focusWeekReviewRoute.test.ts |
| 5 | test/api/stripeWebhookHardening.test.ts |
| 4 | test/plans/requireEntitlement.test.ts |
| 4 | test/hooks/usePolling.test.ts |
| 4 | test/health/healthEngine.test.ts |
| 4 | test/cognitive/cognitiveEngine.test.ts |
| 3 | tests/pii/typeLevelProof.ts |
| 3 | test/security/rateLimit.test.ts |
| 3 | test/payments/webhookIdempotency.test.ts |
| 3 | test/payments/originValidation.test.ts |
| 3 | test/memory/deepMemoryEntitlement.test.ts |
| 3 | test/finance/financeEngine.test.ts |
| 2 | test/memory/retrieve.test.ts |
| 2 | lib/supabase/types_strict.ts |
| 2 | test/focus/focusEngine.test.ts |
| 2 | lib/system/focusWeights.ts |
| 2 | lib/system/recomputeProtocol.ts |
| 2 | lib/server/env.ts |
| 2 | test/api/inboxRoute.test.ts |
| 2 | lib/security/serviceKeyProtection.ts |
| 1 | scripts/detect-pii-write.ts |
| 1 | lib/safety/generateSafeResponse.ts |
| 1 | test/api/deepdiveRateLimit.test.ts |
| 1 | lib/social/buildSocialModel.ts |
| 1 | test/migration/importPipeline.test.ts |
| 1 | lib/sleep/buildSleepEnergyModel.ts |
| 1 | lib/safety/scoreDistress.ts |
| 1 | lib/server/supabaseAdmin.ts |
| 1 | lib/security/piiFirewall.ts |
| 1 | test/system/transitionLogger.test.ts |
| 1 | test/api/vellaTextRoute.test.ts |
| 1 | test/migration/exportShape.test.ts |
| 1 | test/components/FeatureGate.test.tsx |

---

## Per-file errors

### lib/realtime/personaSynth.ts (22)
- 92:60 — TS2339 — Property 'persona' does not exist on type 'RuntimeTuning'.
- 93:21 — TS2339 — Property 'persona' does not exist on type 'RuntimeTuning'.
- 95:64 — TS2339 — Property 'persona' does not exist on type 'RuntimeTuning'.
- 96:21 — TS2339 — Property 'persona' does not exist on type 'RuntimeTuning'.
- 98:65 — TS2339 — Property 'behaviour' does not exist on type 'RuntimeTuning'.
- 99:21 — TS2339 — Property 'behaviour' does not exist on type 'RuntimeTuning'.
- 107:43 — TS2339 — Property 'behaviour' does not exist on type 'RuntimeTuning'.
- 108:38 — TS2339 — Property 'behaviour' does not exist on type 'RuntimeTuning'.
- 109:41 — TS2339 — Property 'behaviour' does not exist on type 'RuntimeTuning'.
- 110:33 — TS2339 — Property 'behaviour' does not exist on type 'RuntimeTuning'.
- 114:29 — TS2339 — Property 'persona' does not exist on type 'RuntimeTuning'.
- 115:32 — TS2339 — Property 'persona' does not exist on type 'RuntimeTuning'.
- 116:28 — TS2339 — Property 'persona' does not exist on type 'RuntimeTuning'.
- 117:43 — TS2339 — Property 'behaviour' does not exist on type 'RuntimeTuning'.
- 118:38 — TS2339 — Property 'behaviour' does not exist on type 'RuntimeTuning'.
- 163:60 — TS2339 — Property 'storytellingEnhancement' does not exist on type '{}'.
- 164:49 — TS2339 — Property 'moodAdaptive' does not exist on type '{}'.
- 165:53 — TS2339 — Property 'contextualPacing' does not exist on type '{}'.
- 166:57 — TS2339 — Property 'motivationalReframes' does not exist on type '{}'.
- 503:24 — TS2339 — Property 'over_empathy_limiter' does not exist on type '{ safety_strictness?: ... }'.
- 529:71 — TS2339 — Property 'trim' does not exist on type '{}'.
- 536:35 — TS2339 — Property 'trim' does not exist on type '{}'.

### lib/safety/complianceFilter.ts (6)
- 16:49 — TS2339 — Property 'filterStrength' does not exist on type '{ safetyStrictness: number; ... }'.
- 17:50 — TS2339 — Property 'outputSmoothing' does not exist on type '{ safetyStrictness: number; ... }'.
- 49:16 — TS2339 — Property 'topic_boundary' does not exist on type '{ safety_strictness?: ... }'.
- 55:16 — TS2339 — Property 'harmful_content_purifier' does not exist on type '{ safety_strictness?: ... }'.
- 62:16 — TS2339 — Property 'repetition_breaker' does not exist on type '{ safety_strictness?: ... }'.
- 85:16 — TS2339 — Property 'sentiment_correction' does not exist on type '{ safety_strictness?: ... }'.

### lib/safety/generateSafeResponse.ts (1)
- 20:7 — TS2322 — Type 'string' is not assignable to type 'undefined'.

### lib/safety/scoreDistress.ts (1)
- 12:48 — TS2339 — Property 'memory' does not exist on type 'RuntimeTuning'.

### lib/security/piiFirewall.ts (1)
- 274:47 — TS1501 — This regular expression flag is only available when targeting 'es6' or later.

### lib/security/serviceKeyProtection.ts (2)
- 74:21 — TS2345 — Argument of type '{ key: string; limit: number; window: number; }' is not assignable to parameter of type 'RateLimitOptions'. Property 'routeKey' is missing.
- 79:21 — TS2345 — Argument of type '{ key: string; limit: number; window: number; }' is not assignable to parameter of type 'RateLimitOptions'. Property 'routeKey' is missing.

### lib/server/env.ts (2)
- 76:35 — TS2367 — This comparison appears to be unintentional because the types '"production" | "test"' and '"dev"' have no overlap.
- 76:52 — TS2367 — This comparison appears to be unintentional because the types '"production" | "test"' and '""' have no overlap.

### lib/server/supabaseAdmin.ts (1)
- 31:53 — TS2304 — Cannot find name 'EdgeRuntime'.

### lib/sleep/buildSleepEnergyModel.ts (1)
- 34:7 — TS2322 — Type 'string' is not assignable to type 'undefined'.

### lib/social/buildSocialModel.ts (1)
- 40:7 — TS2322 — Type 'string' is not assignable to type 'undefined'.

### lib/supabase/types_strict.ts (2)
- 212:11 — TS2677 — A type predicate's type must be assignable to its parameter's type.
- 255:19 — TS2677 — A type predicate's type must be assignable to its parameter's type.

### lib/system/focusWeights.ts (2)
- 69:21 — TS2802 — Type 'Set<EngineDomain>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.
- 70:5 — TS7053 — Element implicitly has an 'any' type because expression of type 'any' can't be used to index type 'DomainWeightMap'.

### lib/system/recomputeProtocol.ts (2)
- 256:7 — TS2740 — Type 'ResolvedPlanEntitlements' is missing the following properties from type 'PlanEntitlement': maxMonthlyTokens, isPaid, usesAllocationBucket, enableRealtime, and 7 more.
- 256:52 — TS2345 — Argument of type 'string' is not assignable to parameter of type 'PlanTier'.

### scripts/detect-pii-write.ts (1)
- 140:25 — TS2802 — Type 'Set<string>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.

### test/api/deepdiveRateLimit.test.ts (1)
- 20:18 — TS1378 — Top-level 'await' expressions are only allowed when the 'module' option is set to 'es2022', 'esnext', etc.

### test/api/focusWeekReviewRoute.test.ts (5)
- 53:27 — TS2345 — Argument of type 'Request' is not assignable to parameter of type 'NextRequest'.
- 66:27 — TS2345 — (same)
- 72:27 — TS2345 — (same)
- 78:27 — TS2345 — (same)
- 89:27 — TS2345 — (same)

### test/api/focusWeekRoute.test.ts (11)
- 62:27, 86:27, 106:27, 114:27, 125:28, 126:28, 145:27, 152:27, 168:15, 182:15, 191:27 — TS2345 — Argument of type 'Request' is not assignable to parameter of type 'NextRequest'.

### test/api/inboxRoute.test.ts (2)
- 109:21 — TS2552 — Cannot find name 'chain'. Did you mean 'chai'?
- 110:17 — TS2552 — (same)

### test/api/migrationPurge.test.ts (6)
- 62:53 — TS2345 — Argument of type '{ data: null; error: null; }' is not assignable to parameter of type 'PostgrestSingleResponse<never>'.
- 77:7 — TS2739 — Type '{ code: string; message: string; }' is missing the following properties from type 'PostgrestError': details, hint, name
- 94:7 — TS2739 — Type '{ message: string; }' is missing the following properties from type 'PostgrestError': details, hint, code, name
- 109:7, 141:7, 162:7 — TS2322 — Type '{ user_id: string; ... }' is not assignable to type 'null'.

### test/api/stripeCheckoutHardening.test.ts (6)
- 65:14, 86:14, 106:14, 127:14, 150:14, 171:14 — TS18047 — 'stripe' is possibly 'null'.

### test/api/stripeWebhookHardening.test.ts (5)
- 101:17, 136:17, 172:17, 203:17, 241:17 — TS18047 — 'stripe' is possibly 'null'.

### test/api/vellaTextRoute.test.ts (1)
- 455:31 — TS2339 — Property 'mode_enum' does not exist on type '{}'.

### test/api/weeklyFocusCheckinRoute.test.ts (9)
- 35:28, 59:28, 73:28, 89:28, 103:28, 120:16, 144:28, 161:28, 178:28 — TS2345 — Argument of type 'Request' is not assignable to parameter of type 'NextRequest'.

### test/cognitive/cognitiveEngine.test.ts (4)
- 186:11, 196:11, 209:11, 221:11 — TS2739 — Type '{ avg_confidence: number; ... }' is missing the following properties from type 'CognitiveStateOutput': confidence_score, sample_size, data_freshness_hours, is_stale

### test/components/FeatureGate.test.tsx (1)
- 68:30 — TS2304 — Cannot find name 'vi'.

### test/finance/financeEngine.test.ts (3)
- 167:11, 177:11, 190:11 — TS2739 — Type '{ monthly_spending: number; ... }' is missing the following properties from type 'FinancialStateOutput': confidence_score, sample_size, data_freshness_hours, is_stale

### test/focus/focusEngine.test.ts (2)
- 58:9, 110:9 — TS2561 — Object literal may only specify known properties, but 'alignedValues' does not exist in type '{ misalignmentDetected: boolean; misalignedValues: string[]; reasons: string[]; }'.

### test/guard/noTierStringLogic.test.ts (33)
- Multiple lines — TS2582 — Cannot find name 'describe' / 'it'. Do you need to install type definitions for a test runner?
- Multiple lines — TS2304 — Cannot find name 'expect'.

### test/health/healthEngine.test.ts (4)
- 141:11, 151:11, 164:11, 176:11 — TS2739 — Type '{ energy_index: number; ... }' is missing the following properties from type 'HealthStateOutput': confidence_score, sample_size, data_freshness_hours, is_stale

### test/hooks/usePolling.test.ts (4)
- 278:5, 282:5, 313:5, 321:5 — TS2322 — Type 'Location' is not assignable to type 'string & Location'.

### test/memory/consolidation.test.ts (5)
- 33:63, 38:63, 53:63 — TS2345 — Argument of type 'string' is not assignable to parameter of type 'PlanEntitlement'.
- 90:28, 95:28 — TS2554 — Expected 3-4 arguments, but got 2.

### test/memory/deepMemoryEntitlement.test.ts (3)
- 13:92 — TS2322 — Type '{ maxMonthlyTokens: number; isPaid?: boolean | undefined; ... }' is not assignable to type 'PlanEntitlement'.
- 90:13, 108:13 — TS2739 — Type '{ ... }' is missing the following properties from type 'PlanEntitlement': isPaid, usesAllocationBucket

### test/memory/retrieve.test.ts (2)
- 123:30, 128:30 — TS2869 — Right operand of ?? is unreachable because the left operand is never nullish.

### test/migration/exportShape.test.ts (1)
- 41:67 — TS2345 — Argument of type 'string' is not assignable to parameter of type '"content" | "id" | "user_id" | "created_at" | "updated_at" | "title"'.

### test/migration/importPipeline.test.ts (1)
- 92:19 — TS2339 — Property 'error' does not exist on type 'RunImportPipelineResult'.

### test/payments/originValidation.test.ts (3)
- 64:19, 71:19, 99:19 — TS2540 — Cannot assign to 'NODE_ENV' because it is a read-only property.

### test/payments/webhookIdempotency.test.ts (3)
- 65:17, 77:17, 92:17 — TS18047 — 'supabaseAdmin' is possibly 'null'.

### test/plans/featureRegistry.test.ts (5)
- 84:11, 97:11, 145:13, 162:13, 180:13 — TS2739 — Type '{ maxMonthlyTokens: number; ... }' is missing the following properties from type 'PlanEntitlement': isPaid, usesAllocationBucket

### test/plans/requireEntitlement.test.ts (4)
- 14:92 — TS2322 — Type '{ maxMonthlyTokens: number; isPaid?: boolean | undefined; ... }' is not assignable to type 'PlanEntitlement'.
- 159:13, 179:13, 197:13 — TS2739 — Type '{ ... }' is missing the following properties from type 'PlanEntitlement': isPaid, usesAllocationBucket

### test/security/rateLimit.test.ts (3)
- 24:21, 25:21, 27:33 — TS2345 — Argument of type '{ key: string; limit: number; window: number; }' is not assignable to parameter of type 'RateLimitOptions'. Property 'routeKey' is missing.

### test/system/transitionLogger.test.ts (1)
- 14:4 — TS1378 — Top-level 'await' expressions are only allowed when the 'module' option is set to 'es2022', etc.

### tests/pii/typeLevelProof.ts (3)
- 60:3 — TS2353 — Object literal may only specify known properties, and 'content' does not exist in type 'StrictJournalEntriesMetaInsert'.
- 69:3 — TS2353 — 'note' does not exist in type 'StrictCheckInsV2Insert'.
- 79:3 — TS2353 — 'content' does not exist in type 'StrictMemoryChunksInsert'.

---

## PHASE PLAN

Each phase: **max 10 files**. Phases ordered by highest leverage (fix shared types first).

### Phase 1 — RuntimeTuning shape (personaSynth + other RuntimeTuning/AdminAIConfig consumers)

Fix root types so `lib/realtime/personaSynth.ts` and other consumers type-check. Add `persona` and `behaviour` (and optional `memory`) to `RuntimeTuning`; add `automation`, `safety` overrides, and `persona_instruction` to `AdminAIConfig` where needed.

| # | File path |
|---|-----------|
| 1 | lib/admin/runtimeTuning.ts |
| 2 | lib/admin/adminConfigTypes.ts |
| 3 | lib/realtime/personaSynth.ts |
| 4 | lib/safety/scoreDistress.ts |
| 5 | lib/safety/complianceFilter.ts |

### Phase 2 — Security / rateLimit / routeKey errors

| # | File path |
|---|-----------|
| 1 | lib/security/serviceKeyProtection.ts |
| 2 | lib/security/piiFirewall.ts |
| 3 | lib/server/env.ts |
| 4 | test/security/rateLimit.test.ts |

### Phase 3 — Supabase types / safeTables mismatches

| # | File path |
|---|-----------|
| 1 | lib/server/supabaseAdmin.ts |
| 2 | lib/supabase/types_strict.ts |
| 3 | tests/pii/typeLevelProof.ts |

### Phase 4 — Remaining lib/ and scripts (non-test)

| # | File path |
|---|-----------|
| 1 | lib/sleep/buildSleepEnergyModel.ts |
| 2 | lib/social/buildSocialModel.ts |
| 3 | lib/system/focusWeights.ts |
| 4 | lib/system/recomputeProtocol.ts |
| 5 | lib/safety/generateSafeResponse.ts |
| 6 | scripts/detect-pii-write.ts |

### Phase 5 — Tests

All remaining files under `test/` and `tests/` (Request vs NextRequest, PostgrestError, PlanEntitlement, describe/it/expect, stripe/supabaseAdmin possibly null, etc.):

- test/api/deepdiveRateLimit.test.ts
- test/api/focusWeekReviewRoute.test.ts
- test/api/focusWeekRoute.test.ts
- test/api/inboxRoute.test.ts
- test/api/migrationPurge.test.ts
- test/api/stripeCheckoutHardening.test.ts
- test/api/stripeWebhookHardening.test.ts
- test/api/vellaTextRoute.test.ts
- test/api/weeklyFocusCheckinRoute.test.ts
- test/cognitive/cognitiveEngine.test.ts
- test/components/FeatureGate.test.tsx
- test/finance/financeEngine.test.ts
- test/focus/focusEngine.test.ts
- test/guard/noTierStringLogic.test.ts
- test/health/healthEngine.test.ts
- test/hooks/usePolling.test.ts
- test/memory/consolidation.test.ts
- test/memory/deepMemoryEntitlement.test.ts
- test/memory/retrieve.test.ts
- test/migration/exportShape.test.ts
- test/migration/importPipeline.test.ts
- test/payments/originValidation.test.ts
- test/payments/webhookIdempotency.test.ts
- test/plans/featureRegistry.test.ts
- test/plans/requireEntitlement.test.ts
- test/system/transitionLogger.test.ts

---

## PHASE 1 RESULTS

- **Command (after Phase 1):** `pnpm exec tsc --noEmit --pretty false > tsc_errors_phase1.txt`
- **Timestamp:** 2026-03-01 (post Phase 1)

### Files changed

| File path | Change |
|-----------|--------|
| lib/admin/runtimeTuning.ts | Extended type and defaults |
| lib/admin/adminConfigTypes.ts | Extended AdminAIConfig |

No code changes were required in lib/realtime/personaSynth.ts, lib/safety/scoreDistress.ts, or lib/safety/complianceFilter.ts; they type-check after the root type updates.

### Minimal diffs summary

- **lib/admin/runtimeTuning.ts:** Added to `RuntimeTuning`: `safety.filterStrength`, `safety.outputSmoothing`; new `persona` (empathy, directness, energy); new `behaviour` (playfulness, emotionalContainment, analyticalDepth, introspectionDepth, conciseness); new `memory` (emotionalWeighting). Populated in `adaptConfigToTuning` and `getDefaultTuning` with safe defaults (and optional config casting for optional admin fields).
- **lib/admin/adminConfigTypes.ts:** Extended `AdminAIConfig.safety` with optional `topic_boundary`, `harmful_content_purifier`, `repetition_breaker`, `sentiment_correction`, `over_empathy_limiter`. Added optional `automation` (storytellingEnhancement, moodAdaptive, contextualPacing, motivationalReframes) and `persona_instruction` (string).

### New remaining top 10 files by error count (from tsc_errors_phase1.txt)

| Count | File path |
|------:|-----------|
| 33 | test/guard/noTierStringLogic.test.ts |
| 11 | test/api/focusWeekRoute.test.ts |
| 9 | test/api/weeklyFocusCheckinRoute.test.ts |
| 6 | test/api/migrationPurge.test.ts |
| 6 | test/api/stripeCheckoutHardening.test.ts |
| 5 | test/api/focusWeekReviewRoute.test.ts |
| 5 | test/memory/consolidation.test.ts |
| 5 | test/api/stripeWebhookHardening.test.ts |
| 5 | test/plans/featureRegistry.test.ts |
| 4 | test/health/healthEngine.test.ts |

