# Local-First Migration Mapping Report

This report maps all occurrences of auth dependencies, token operations, and non-allowed Supabase table references that must be converted to local-first mode.

---

## 1. requireUserId( - 63 occurrences

### BLOCKING - API Routes (Must convert to local-first)

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/app/api/insights/patterns/route.ts` | 83 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/insights/generate/route.ts` | 108 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/forecast/route.ts` | 16 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/forecast/route.ts` | 32 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/identity/route.ts` | 14 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/weekly-review/route.ts` | 9 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/connection-index/route.ts` | 9 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/traits/route.ts` | 7 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/traits/route.ts` | 22 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/reflection/route.ts` | 8 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/patterns/route.ts` | 8 | `const authUserId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/life-themes/route.ts` | 7 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/journal-themes/route.ts` | 7 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/cognitive-distortions/route.ts` | 7 | `const authUserId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/behaviour-loops/route.ts` | 7 | `const authUserId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/strengths-values/route.ts` | 7 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/growth-roadmap/route.ts` | 7 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/strategy/route.ts` | 9 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/progress/route.ts` | 7 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/progress/route.ts` | 13 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/deepdive/route.ts` | 11 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/goals/route.ts` | 13 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/goals/route.ts` | 30 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/goals/route.ts` | 59 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/architect/route.ts` | 7 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/prediction/route.ts` | 7 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/nudge/route.ts` | 7 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/audio/vella/route.ts` | 15 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/themes/route.ts` | 12 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/deep-insights/route.ts` | 11 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/deep-insights/route.ts` | 26 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/connection-depth/route.ts` | 9 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/connection-depth/route.ts` | 20 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/loops/route.ts` | 12 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/distortions/route.ts` | 12 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/clarity/route.ts` | 8 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/emotion-intel/route.ts` | 8 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/compass/route.ts` | 8 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/voice/speak/route.ts` | 13 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/regulation/route.ts` | 14 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/journal/route.ts` | 26 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/journal/route.ts` | 41 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/journal/route.ts` | 79 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/journal/route.ts` | 119 | `userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/roadmap/route.ts` | 18 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/vella/text/route.ts` | 62 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |
| `MOBILE/app/api/realtime/token/route.ts` | 25 | `const userId = await requireUserId();` | BLOCKING | ✅ YES |

### BLOCKING - Payment/Account Routes (May keep auth, but should degrade gracefully)

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/app/api/stripe/token-pack/route.ts` | 10 | `const userId = await requireUserId();` | BLOCKING | ⚠️ KEEP (payment requires auth) |
| `MOBILE/app/api/stripe/create-checkout-session/route.ts` | 8 | `const userId = await requireUserId();` | BLOCKING | ⚠️ KEEP (payment requires auth) |
| `MOBILE/app/api/account/delete/route.ts` | 10 | `const userId = await requireUserId();` | BLOCKING | ⚠️ KEEP (account deletion requires auth) |
| `MOBILE/app/api/account/export/route.ts` | 10 | `const userId = await requireUserId();` | BLOCKING | ⚠️ KEEP (account export requires auth) |
| `MOBILE/app/api/admin/policy/route.ts` | 11 | `const userId = await requireUserId();` | BLOCKING | ⚠️ KEEP (admin route requires auth) |

### SAFE - Already has fallback (but should still convert)

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/lib/hooks/useCheckins.ts` | 42 | `async function requireUserId() {` | SAFE | ✅ YES (local helper, has fallback) |
| `MOBILE/lib/hooks/useCheckins.ts` | 69 | `userId = await requireUserId();` | SAFE | ✅ YES (wrapped in try/catch) |
| `MOBILE/lib/hooks/useCheckins.ts` | 108 | `userId = await requireUserId();` | SAFE | ✅ YES (wrapped in try/catch) |
| `MOBILE/lib/hooks/useCheckins.ts` | 169 | `userId = await requireUserId();` | SAFE | ✅ YES (wrapped in try/catch) |

### BLOCKING - Core auth function (must be refactored)

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/lib/supabase/server-auth.ts` | 11 | `export async function requireUserId(): Promise<string> {` | BLOCKING | ✅ YES (core function) |
| `MOBILE/lib/auth/requireUser.ts` | 5 | `export async function requireUserId(): Promise<string> {` | BLOCKING | ✅ YES (duplicate function) |

---

## 2. signInAnonymously( - 8 occurrences

### BLOCKING - All must be removed

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/lib/supabase/server-auth.ts` | 26 | `const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();` | BLOCKING | ✅ YES (remove) |
| `MOBILE/lib/hooks/useCheckins.ts` | 54 | `const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();` | BLOCKING | ✅ YES (remove) |
| `MOBILE/middleware.ts` | 15 | `await supabase.auth.signInAnonymously();` | BLOCKING | ✅ YES (remove) |
| `MOBILE/lib/auth/ensureVellaSessionServer.ts` | 11 | `const { data } = await supabase.auth.signInAnonymously();` | BLOCKING | ✅ YES (remove) |
| `MOBILE/lib/auth/ensureVellaSession.ts` | 28 | `const anon = await supabase.auth.signInAnonymously();` | BLOCKING | ✅ YES (remove) |
| `MOBILE/lib/auth/ensureAnonSession.ts` | 21 | `const { data: anonData, error: anonError } = await client.auth.signInAnonymously();` | BLOCKING | ✅ YES (remove) |
| `MOBILE/lib/auth/ensureSession.ts` | 21 | `await anyAuth.signInAnonymously();` | BLOCKING | ✅ YES (remove) |

---

## 3. supabase.auth.getUser( - 16 occurrences

### BLOCKING - Must convert to optional

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/lib/supabase/server-auth.ts` | 19 | `} = await supabase.auth.getUser();` | BLOCKING | ✅ YES |
| `MOBILE/lib/hooks/useCheckins.ts` | 48 | `const { data, error } = await supabase.auth.getUser();` | SAFE | ✅ YES (already has fallback) |
| `MOBILE/lib/auth/requireAdmin.ts` | 20 | `} = await supabase.auth.getUser();` | BLOCKING | ⚠️ KEEP (admin requires auth) |
| `MOBILE/app/session/page.tsx` | 258 | `void supabase.auth.getUser().then(({ data, error }) => {` | SAFE | ✅ YES (optional check) |
| `MOBILE/lib/hooks/useUserSettings.ts` | 135 | `const { data: authData, error: authError } = await supabase.auth.getUser();` | SAFE | ✅ YES (optional check) |
| `MOBILE/app/api/realtime/offer/route.ts` | 47 | `} = await supabase.auth.getUser(headerToken);` | BLOCKING | ✅ YES |
| `MOBILE/lib/auth/getServerUser.ts` | 13 | `} = await supabase.auth.getUser();` | BLOCKING | ✅ YES |
| `MOBILE/app/profile/page.tsx` | 33 | `const { data } = await supabase.auth.getUser();` | SAFE | ✅ YES (optional check) |
| `MOBILE/lib/memory/localMemory.ts` | 242 | `const { data: auth } = await supabase.auth.getUser();` | SAFE | ✅ YES (optional check) |
| `MOBILE/lib/hooks/useJournal.ts` | 30 | `const { data } = await supabase.auth.getUser();` | SAFE | ✅ YES (optional check) |
| `MOBILE/lib/hooks/useAccountPlan.ts` | 67 | `const { data: authData, error: authError } = await supabase.auth.getUser();` | SAFE | ✅ YES (optional check) |
| `MOBILE/lib/profile/upsertProfile.ts` | 20 | `const { data: authData, error: authError } = await supabase.auth.getUser();` | SAFE | ✅ YES (optional check) |
| `MOBILE/app/growth-plan/page.tsx` | 64 | `const { data, error } = await supabase.auth.getUser();` | SAFE | ✅ YES (optional check) |
| `MOBILE/app/session-insights/page.tsx` | 35 | `const { data, error } = await supabase.auth.getUser();` | SAFE | ✅ YES (optional check) |

---

## 4. supabase.auth.onAuthStateChange( - 0 occurrences

**No matches found.** ✅

---

## 5. getTokenCost( - 6 occurrences

### BLOCKING - All must have fallback

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/lib/tokens/getTokenCost.ts` | 6 | `export async function getTokenCost(event: string): Promise<number> {` | BLOCKING | ✅ YES (core function) |
| `MOBILE/app/api/insights/patterns/route.ts` | 111 | `getTokenCost("deep_emotion"),` | BLOCKING | ✅ YES |
| `MOBILE/app/api/insights/generate/route.ts` | 221 | `getTokenCost(FEATURE_KEY),` | BLOCKING | ✅ YES |
| `MOBILE/lib/ai/agents.ts` | 1242 | `getTokenCost(featureKey),` | BLOCKING | ✅ YES |
| `MOBILE/lib/ai/reflection.ts` | 120 | `getTokenCost(featureKey),` | BLOCKING | ✅ YES |
| `MOBILE/lib/memory/summariser.ts` | 29 | `getTokenCost(featureKey),` | BLOCKING | ✅ YES |

---

## 6. getUserTokenState( - 7 occurrences

### BLOCKING - All must have fallback

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/lib/tokens/getUserTokenState.ts` | 18 | `export async function getUserTokenState(` | BLOCKING | ✅ YES (core function) |
| `MOBILE/app/api/insights/patterns/route.ts` | 110 | `getUserTokenState(userId),` | BLOCKING | ✅ YES |
| `MOBILE/app/api/insights/generate/route.ts` | 220 | `getUserTokenState(body.userId),` | BLOCKING | ✅ YES |
| `MOBILE/app/session/page.tsx` | 279 | `const snapshot = await getUserTokenState(userId, supabase);` | BLOCKING | ✅ YES |
| `MOBILE/lib/ai/agents.ts` | 1241 | `getUserTokenState(userId),` | BLOCKING | ✅ YES |
| `MOBILE/lib/ai/reflection.ts` | 121 | `getUserTokenState(payload.userId),` | BLOCKING | ✅ YES |
| `MOBILE/lib/memory/summariser.ts` | 28 | `getUserTokenState(userId),` | BLOCKING | ✅ YES |

---

## 7. chargeTokens( - 6 occurrences

### BLOCKING - All must be no-op in local mode

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/lib/tokens/chargeTokens.ts` | 16 | `export async function chargeTokens(userId: string, amount: number, event: string): Promise<ChargeSummary> {` | BLOCKING | ✅ YES (core function) |
| `MOBILE/app/api/insights/patterns/route.ts` | 158 | `await chargeTokens(userId, cost, "deep_emotion");` | BLOCKING | ✅ YES |
| `MOBILE/app/api/insights/generate/route.ts` | 263 | `await chargeTokens(body.userId, cost, FEATURE_KEY);` | BLOCKING | ✅ YES |
| `MOBILE/lib/ai/agents.ts` | 1250 | `await chargeTokens(userId, cost, featureKey);` | BLOCKING | ✅ YES |
| `MOBILE/lib/ai/reflection.ts` | 166 | `await chargeTokens(payload.userId, cost, featureKey);` | BLOCKING | ✅ YES |
| `MOBILE/lib/memory/summariser.ts` | 36 | `await chargeTokens(userId, cost, featureKey);` | BLOCKING | ✅ YES |

---

## 8. supabase.from("user_goals") - 3 occurrences

### BLOCKING - Table doesn't exist, must use local storage

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/lib/goals/goalEngine.ts` | 135 | `.from("user_goals")` | BLOCKING | ✅ YES (table doesn't exist) |
| `MOBILE/lib/goals/goalEngine.ts` | 193 | `"user_goals",` (in safeInsert) | BLOCKING | ✅ YES (table doesn't exist) |
| `MOBILE/lib/goals/goalEngine.ts` | 256 | `"user_goals",` (in safeUpdate) | BLOCKING | ✅ YES (table doesn't exist) |

---

## 9. supabase.from("user_goal_actions") - 2 occurrences

### BLOCKING - Table doesn't exist, must use local storage

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/lib/goals/goalEngine.ts` | 167 | `.from("user_goal_actions")` | BLOCKING | ✅ YES (table doesn't exist) |
| `MOBILE/lib/goals/goalEngine.ts` | 230 | `"user_goal_actions",` (in safeInsert) | BLOCKING | ✅ YES (table doesn't exist) |
| `MOBILE/lib/goals/goalEngine.ts` | 291 | `"user_goal_actions",` (in safeUpdate) | BLOCKING | ✅ YES (table doesn't exist) |

---

## 10. supabase.from("last_active") - 2 occurrences

### BLOCKING - Table doesn't exist, must query profiles table instead

| File | Line | Code Snippet | Status | Convert to Local-First? |
|------|------|--------------|--------|-------------------------|
| `MOBILE/lib/memory/lastActive.ts` | 16 | `await fromSafe("last_active")` | BLOCKING | ✅ YES (table doesn't exist, use profiles.last_active_at) |
| `MOBILE/lib/memory/lastActive.ts` | 41 | `await fromSafe("last_active")` | BLOCKING | ✅ YES (table doesn't exist, use profiles.last_active_at) |

---

## 11. Non-Allowed Supabase Tables - 2 additional tables

### BLOCKING - Tables don't exist in migrations

| File | Line | Code Snippet | Table | Status | Convert to Local-First? |
|------|------|--------------|-------|--------|-------------------------|
| `MOBILE/lib/supabase/usage/logPromptSignature.ts` | 18 | `supabase.from("prompt_signatures").insert({` | `prompt_signatures` | BLOCKING | ✅ YES (table doesn't exist) |
| `MOBILE/lib/progress/loadAchievements.ts` | 13 | `.from("achievements")` | `achievements` | BLOCKING | ✅ YES (table doesn't exist) |
| `MOBILE/lib/progress/checkAchievements.ts` | 20 | `"achievements",` (in safeUpsert) | `achievements` | BLOCKING | ✅ YES (table doesn't exist) |

---

## SUMMARY STATISTICS

- **Total `requireUserId(` calls:** 63 (47 BLOCKING API routes, 5 payment/admin routes, 6 SAFE with fallback, 2 core functions, 3 in hooks)
- **Total `signInAnonymously(` calls:** 8 (all BLOCKING, must be removed)
- **Total `supabase.auth.getUser(` calls:** 16 (2 BLOCKING core, 1 admin, 13 SAFE optional checks)
- **Total `getTokenCost(` calls:** 6 (all BLOCKING)
- **Total `getUserTokenState(` calls:** 7 (all BLOCKING)
- **Total `chargeTokens(` calls:** 6 (all BLOCKING)
- **Total `user_goals` references:** 3 (all BLOCKING, table doesn't exist)
- **Total `user_goal_actions` references:** 3 (all BLOCKING, table doesn't exist)
- **Total `last_active` table references:** 2 (all BLOCKING, table doesn't exist, should use profiles table)
- **Total non-allowed table references:** 3 (`prompt_signatures`, `achievements` - tables don't exist)

**Total files requiring conversion:** ~70+ files

---

## PRIORITY FILES FOR CONVERSION

### Phase 1 - Core Functions (Must fix first)
1. `MOBILE/lib/supabase/server-auth.ts` - `requireUserId()` function
2. `MOBILE/lib/tokens/getTokenCost.ts` - Token cost lookup
3. `MOBILE/lib/tokens/getUserTokenState.ts` - Token state calculation
4. `MOBILE/lib/tokens/chargeTokens.ts` - Token charging
5. `MOBILE/lib/goals/goalEngine.ts` - Goals system (uses non-existent tables)
6. `MOBILE/lib/memory/lastActive.ts` - Last active tracking (wrong table)

### Phase 2 - High-Traffic API Routes
1. `MOBILE/app/api/insights/patterns/route.ts`
2. `MOBILE/app/api/insights/generate/route.ts`
3. `MOBILE/app/api/forecast/route.ts`
4. `MOBILE/app/api/connection-index/route.ts`

### Phase 3 - All Other API Routes
- All remaining routes in `MOBILE/app/api/**/*.ts` (47 routes total)

### Phase 4 - Client-Side Hooks
- `MOBILE/lib/hooks/useCheckins.ts`
- `MOBILE/lib/hooks/useUserSettings.ts`
- `MOBILE/lib/hooks/useJournal.ts`
- `MOBILE/lib/hooks/useAccountPlan.ts`

### Phase 5 - Remove Auth Helpers
- `MOBILE/lib/auth/ensureVellaSessionServer.ts`
- `MOBILE/lib/auth/ensureVellaSession.ts`
- `MOBILE/lib/auth/ensureAnonSession.ts`
- `MOBILE/lib/auth/ensureSession.ts`
- `MOBILE/middleware.ts` (remove anonymous sign-in)

---

**End of Mapping Report**

