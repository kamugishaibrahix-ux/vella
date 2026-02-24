# Admin Wiring Audit Report
## Vella Control → MOBILE Runtime Integration

**Date**: 2025-01-01  
**Scope**: Complete end-to-end audit of admin UI controls to MOBILE runtime consumption

---

## STEP 1: Admin UI Pages Identified

### Fully Functional Pages:
1. **`/ai-configuration`** - AI tuning controls (persona, behaviour, voice, models, memory, safety, automation)
2. **`/users`** - User management (plan updates, token adjustments, status, voice flags)
3. **`/subscriptions`** - Subscription overview (read-only display)
4. **`/logs`** - System logs viewer (read-only)
5. **`/feedback`** - Feedback viewer (read-only)
6. **`/dashboard`** - Analytics dashboard (read-only)
7. **`/insights`** - Insights viewer (read-only)
8. **`/content-library`** - Content management (read-only)
9. **`/system-settings`** - System settings (read-only)

---

## STEP 2: Full Wiring Path Analysis

### ✅ FULLY WIRED: AI Configuration (`/ai-configuration`)

**UI → API Route → Supabase → MOBILE Loader → Runtime Consumer**

#### 2.1 Persona Controls
- **UI**: Sliders for `empathy`, `directness`, `energy`
- **API**: `POST /api/admin/config/save` → writes to `admin_global_config.config.persona`
- **Supabase**: `admin_global_config.config` (JSONB)
- **MOBILE Loader**: `loadActiveAdminAIConfig()` → reads from `admin_ai_config` (⚠️ **MISMATCH**)
- **Runtime Consumer**: `personaSynth.ts` → blends via `runtimeTuning.persona.*`
- **Status**: ⚠️ **PARTIALLY WIRED** - Admin writes to `admin_global_config`, MOBILE reads from `admin_ai_config` (tables not synced)

#### 2.2 Behaviour Controls
- **UI**: Sliders for `empathy_regulation`, `directness`, `emotional_containment`, `analytical_depth`, `playfulness`, `introspection_depth`, `conciseness`, `safety_strictness`
- **API**: `POST /api/admin/config/save` → writes to `admin_global_config.config.behaviour`
- **Supabase**: `admin_global_config.config` (JSONB)
- **MOBILE Loader**: `loadActiveAdminAIConfig()` → reads from `admin_ai_config` (⚠️ **MISMATCH**)
- **Runtime Consumer**: `personaSynth.ts` → blends via `runtimeTuning.behaviour.*`
- **Status**: ⚠️ **PARTIALLY WIRED** - Same table mismatch issue

#### 2.3 Voice Controls
- **UI**: Sliders for `softness`, `cadence`, `breathiness`, `pause_length`, `whisper_sensitivity`, `warmth`, `interruption_recovery`
- **API**: `POST /api/admin/config/save` → writes to `admin_global_config.config.voice`
- **Supabase**: `admin_global_config.config` (JSONB)
- **MOBILE Loader**: `loadActiveAdminAIConfig()` → reads from `admin_ai_config` (⚠️ **MISMATCH**)
- **Runtime Consumer**: `vellaRealtimeConfig.ts` → blends via `runtimeTuning.voice.*`
- **Status**: ⚠️ **PARTIALLY WIRED** - Same table mismatch issue

#### 2.4 Model Selection
- **UI**: Dropdowns for `text_model`, `realtime_model`, `embedding_model`, `reasoning_depth`
- **API**: `POST /api/admin/config/save` → writes to `admin_global_config.config.models`
- **Supabase**: `admin_global_config.config` (JSONB)
- **MOBILE Loader**: `loadActiveAdminAIConfig()` → reads from `admin_ai_config` (⚠️ **MISMATCH**)
- **Runtime Consumer**: 
  - `fullAI.ts` → uses `runtimeTuning.models.textModel` for text responses
  - `vellaRealtimeConfig.ts` → uses `runtimeTuning.models.realtimeModel` for voice
  - `fullAI.ts` → uses `runtimeTuning.models.reasoningDepth` (⚠️ **NOT CONSUMED**)
- **Status**: ⚠️ **PARTIALLY WIRED** - Table mismatch + `reasoningDepth` not used

#### 2.5 Generation Parameters
- **UI**: Sliders for `temperature`, `top_p`, `max_output`
- **API**: `POST /api/admin/config/save` → writes to `admin_global_config.config.model`
- **Supabase**: `admin_global_config.config` (JSONB)
- **MOBILE Loader**: `loadActiveAdminAIConfig()` → reads from `admin_ai_config` (⚠️ **MISMATCH**)
- **Runtime Consumer**: 
  - `fullAI.ts` → uses `runtimeTuning.generation.temperature`, `topP`, `maxOutputTokens` for text
  - `vellaRealtimeConfig.ts` → blends `runtimeTuning.generation.temperature`, `topP` for voice
- **Status**: ⚠️ **PARTIALLY WIRED** - Table mismatch

#### 2.6 Memory Controls
- **UI**: Sliders for `selectivity`, `context_history`, `rag_recall_strength`, `emotional_weighting`; Toggles for `long_term`, `emotional_memory`, `continuity`, `insight_retention`
- **API**: `POST /api/admin/config/save` → writes to `admin_global_config.config.memory`
- **Supabase**: `admin_global_config.config` (JSONB)
- **MOBILE Loader**: `loadActiveAdminAIConfig()` → reads from `admin_ai_config` (⚠️ **MISMATCH**)
- **Runtime Consumer**: 
  - `conversation.ts` → uses `runtimeTuning.memory.maxContextTurns` for context limit
  - ⚠️ **NOT CONSUMED**: `selectivity`, `ragRecallStrength`, `emotionalWeighting`, memory toggles
- **Status**: ⚠️ **PARTIALLY WIRED** - Table mismatch + most memory controls unused

#### 2.7 Safety Controls
- **UI**: Sliders for `filter_strength`, `red_flag_sensitivity`, `output_smoothing`; Toggles for safety flags
- **API**: `POST /api/admin/config/save` → writes to `admin_global_config.config.safety`
- **Supabase**: `admin_global_config.config` (JSONB)
- **MOBILE Loader**: `loadActiveAdminAIConfig()` → reads from `admin_ai_config` (⚠️ **MISMATCH**)
- **Runtime Consumer**: 
  - `complianceFilter.ts` → uses `runtimeTuning.safety.filterStrength`
  - `scoreDistress.ts` → uses `runtimeTuning.safety.redFlagSensitivity`
  - ⚠️ **NOT CONSUMED**: `outputSmoothing`, all safety toggles
- **Status**: ⚠️ **PARTIALLY WIRED** - Table mismatch + some safety controls unused

#### 2.8 Automation Controls
- **UI**: Toggles for `insightInjection`, `storytellingEnhancement`, `motivationalReframes`, `moodAdaptive`, `contextualPacing`
- **API**: `POST /api/admin/config/save` → writes to `admin_global_config.config.automation`
- **Supabase**: `admin_global_config.config` (JSONB)
- **MOBILE Loader**: `loadActiveAdminAIConfig()` → reads from `admin_ai_config` (⚠️ **MISMATCH**)
- **Runtime Consumer**: ⚠️ **NOT CONSUMED** - No code checks `runtimeTuning.automation.*`
- **Status**: ❌ **NOT WIRED** - Table mismatch + no runtime consumption

#### 2.9 Hidden Modules
- **UI**: Toggles for `mentorMode`, `therapistMode`, `stoicMode`, `coachingMode`, `listeningMode`, `childSafeMode`, `noAttachmentMode`
- **API**: `POST /api/admin/config/save` → writes to `admin_global_config.config.hidden_modules`
- **Supabase**: `admin_global_config.config` (JSONB)
- **MOBILE Loader**: `loadActiveAdminAIConfig()` → reads from `admin_ai_config` (⚠️ **MISMATCH**)
- **Runtime Consumer**: ⚠️ **NOT CONSUMED** - No code checks `runtimeTuning` for hidden modules
- **Status**: ❌ **NOT WIRED** - Table mismatch + no runtime consumption

#### 2.10 Persona Instruction Override
- **UI**: Textarea for `persona_instruction`
- **API**: `POST /api/admin/config/save` → writes to `admin_global_config.config.persona_instruction`
- **Supabase**: `admin_global_config.config` (JSONB)
- **MOBILE Loader**: `loadActiveAdminAIConfig()` → reads from `admin_ai_config` (⚠️ **MISMATCH**)
- **Runtime Consumer**: ⚠️ **NOT CONSUMED** - No code uses `config.persona_instruction`
- **Status**: ❌ **NOT WIRED** - Table mismatch + no runtime consumption

---

### ✅ FULLY WIRED: User Management (`/users`)

#### 3.1 User Plan Update
- **UI**: Dropdown to change user plan
- **API**: `POST /api/admin/users/update-plan` → updates `user_metadata.plan`
- **Supabase**: `user_metadata.plan` (text)
- **MOBILE Loader**: `loadAdminUserPolicy()` → reads `user_metadata.plan` → maps to `planTier`
- **Runtime Consumer**: `session/page.tsx` → uses `adminPolicy.planTier` for plan checks
- **Status**: ✅ **FULLY WIRED**

#### 3.2 Token Balance Adjustment
- **UI**: Input to adjust token balance
- **API**: `POST /api/admin/users/update-tokens` → updates `user_metadata.token_balance` + writes to `token_ledger`
- **Supabase**: `user_metadata.token_balance` (bigint), `token_ledger` (audit trail)
- **MOBILE Loader**: `loadAdminUserPolicy()` → reads `user_metadata.token_balance` → maps to `hardTokenCap`
- **Runtime Consumer**: ⚠️ **NOT CONSUMED** - `hardTokenCap` is loaded but not enforced in session/token logic
- **Status**: ⚠️ **PARTIALLY WIRED** - Data flows but not enforced

#### 3.3 User Status (Disabled/Blocked)
- **UI**: Status dropdown (`active`, `suspended`, `banned`)
- **API**: ⚠️ **MISSING** - No API route to update `user_metadata.status`
- **Supabase**: `user_metadata.status` (text)
- **MOBILE Loader**: `loadAdminUserPolicy()` → reads `user_metadata.status` → maps to `isDisabled` and `canStartSession`
- **Runtime Consumer**: 
  - `session/page.tsx` → blocks session start if `adminPolicy.isDisabled` or `!adminPolicy.canStartSession`
  - `realtime/offer/route.ts` → blocks realtime if `policy.isDisabled` or `!policy.canStartSession`
  - `realtime/token/route.ts` → blocks realtime if `policy.isDisabled` or `!policy.canStartSession`
- **Status**: ⚠️ **PARTIALLY WIRED** - MOBILE respects it, but admin UI cannot set it

#### 3.4 Voice Enabled Flag
- **UI**: Toggle for `voiceEnabled` in user drawer
- **API**: ⚠️ **MISSING** - No API route to update `user_metadata.voice_enabled`
- **Supabase**: `user_metadata.voice_enabled` (boolean)
- **MOBILE Loader**: `loadAdminUserPolicy()` → reads `user_metadata.voice_enabled` → maps to `realtimeEnabled`
- **Runtime Consumer**: 
  - `session/page.tsx` → blocks voice mode if `!adminPolicy.realtimeEnabled`
  - `realtime/offer/route.ts` → blocks realtime if `!policy.realtimeEnabled`
  - `realtime/token/route.ts` → blocks realtime if `!policy.realtimeEnabled`
- **Status**: ⚠️ **PARTIALLY WIRED** - MOBILE respects it, but admin UI cannot set it

#### 3.5 Realtime Beta Flag
- **UI**: Toggle for `realtimeBeta` in user drawer
- **API**: ⚠️ **MISSING** - No API route to update `user_metadata.realtime_beta`
- **Supabase**: `user_metadata.realtime_beta` (boolean)
- **MOBILE Loader**: `loadAdminUserPolicy()` → reads `user_metadata.realtime_beta` → maps to `realtimeEnabled` (fallback)
- **Runtime Consumer**: Same as `voice_enabled`
- **Status**: ⚠️ **PARTIALLY WIRED** - MOBILE respects it, but admin UI cannot set it

#### 3.6 Admin Notes
- **UI**: Textarea for `notes` in user drawer
- **API**: ⚠️ **MISSING** - No API route to update `user_metadata.notes`
- **Supabase**: `user_metadata.notes` (text)
- **MOBILE Loader**: `loadAdminUserPolicy()` → reads `user_metadata.notes` → maps to `notes`
- **Runtime Consumer**: ⚠️ **NOT CONSUMED** - Notes are loaded but never displayed or used
- **Status**: ❌ **NOT WIRED** - Admin UI cannot set it, MOBILE doesn't use it

---

### ❌ READ-ONLY PAGES (No Admin Controls)

#### 4.1 Subscriptions (`/subscriptions`)
- **UI**: Display only
- **API**: `GET /api/admin/subscriptions/list` → reads `subscriptions`
- **Status**: ✅ **READ-ONLY** - No controls to wire

#### 4.2 Logs (`/logs`)
- **UI**: Display only
- **API**: `GET /api/admin/logs/list` → reads `system_logs` + `admin_activity_log`
- **Status**: ✅ **READ-ONLY** - No controls to wire

#### 4.3 Feedback (`/feedback`)
- **UI**: Display only
- **API**: ⚠️ **MISSING** - No API route to read `feedback` table
- **Status**: ⚠️ **BROKEN** - UI exists but no data source

#### 4.4 Dashboard (`/dashboard`)
- **UI**: Display only
- **API**: `GET /api/admin/analytics/get` → reads `analytics_counters`
- **Status**: ✅ **READ-ONLY** - No controls to wire

---

## STEP 3: Critical Issues Detected

### 🔴 CRITICAL: Table Mismatch
**Issue**: Admin panel writes to `admin_global_config`, MOBILE reads from `admin_ai_config`
- **Admin writes**: `apps/vella-control/app/api/admin/config/save/route.ts` → `admin_global_config`
- **MOBILE reads**: `MOBILE/lib/admin/adminConfig.ts` → `admin_ai_config`
- **Impact**: All AI configuration changes from admin panel are **NOT** consumed by MOBILE runtime
- **Fix Required**: Either:
  1. Sync `admin_global_config` → `admin_ai_config` on save, OR
  2. Change MOBILE to read from `admin_global_config`, OR
  3. Change admin to write to `admin_ai_config`

### 🔴 CRITICAL: Missing API Routes
**Issue**: Admin UI has controls but no API routes to save them
- **User Status**: UI has dropdown, no `POST /api/admin/users/update-status`
- **Voice Enabled**: UI has toggle, no `POST /api/admin/users/update-voice-enabled`
- **Realtime Beta**: UI has toggle, no `POST /api/admin/users/update-realtime-beta`
- **Admin Notes**: UI has textarea, no `POST /api/admin/users/update-notes`
- **Impact**: Admin cannot actually control these user settings

### 🟡 WARNING: Unused Runtime Controls
**Issue**: Admin config fields exist but MOBILE runtime doesn't consume them
- **Automation toggles**: `insightInjection`, `storytellingEnhancement`, etc. - loaded but never checked
- **Hidden modules**: `mentorMode`, `therapistMode`, etc. - loaded but never checked
- **Persona instruction override**: `persona_instruction` - loaded but never used
- **Memory controls**: `selectivity`, `ragRecallStrength`, `emotionalWeighting` - loaded but never used
- **Safety toggles**: All boolean safety flags - loaded but never checked
- **Safety output smoothing**: `outputSmoothing` - loaded but never used
- **Reasoning depth**: `reasoningDepth` - loaded but never used in model selection
- **Token hard cap**: `hardTokenCap` - loaded but never enforced

### 🟡 WARNING: Missing Table Sync
**Issue**: `admin_global_config` and `admin_ai_config` are separate tables
- **Migration creates**: Both tables exist
- **Admin writes to**: `admin_global_config`
- **MOBILE reads from**: `admin_ai_config`
- **Impact**: Changes never propagate

### 🟡 WARNING: Missing Feedback API
**Issue**: Feedback page has no data source
- **UI exists**: `apps/vella-control/app/feedback/page.tsx`
- **API missing**: No `GET /api/admin/feedback/list`
- **Table exists**: `feedback` table in migration
- **Impact**: Feedback page shows no data

---

## STEP 4: Realtime Path Audit

### ✅ WIRED: Realtime Eligibility
- **Admin Control**: `user_metadata.realtime_enabled` / `realtime_beta`
- **MOBILE Check**: `realtime/offer/route.ts` + `realtime/token/route.ts`
- **Status**: ✅ **WIRED** (but admin UI cannot set it - see Critical Issues)

### ✅ WIRED: Realtime Model Selection
- **Admin Control**: `admin_global_config.config.models.realtime_model`
- **MOBILE Consumer**: `vellaRealtimeConfig.ts` → `getVellaRealtimeVoiceConfig()`
- **Status**: ⚠️ **PARTIALLY WIRED** (table mismatch - admin writes to `admin_global_config`, MOBILE reads from `admin_ai_config`)

### ✅ WIRED: Realtime Generation Parameters
- **Admin Control**: `admin_global_config.config.model.temperature`, `top_p`, `max_output`
- **MOBILE Consumer**: `vellaRealtimeConfig.ts` → blends into realtime config
- **Status**: ⚠️ **PARTIALLY WIRED** (table mismatch)

### ✅ WIRED: Realtime Safety
- **Admin Control**: `admin_global_config.config.safety.filter_strength`, `red_flag_sensitivity`
- **MOBILE Consumer**: `complianceFilter.ts`, `scoreDistress.ts`
- **Status**: ⚠️ **PARTIALLY WIRED** (table mismatch)

---

## STEP 5: Text Path Audit

### ✅ WIRED: Text Model Selection
- **Admin Control**: `admin_global_config.config.models.text_model`
- **MOBILE Consumer**: `fullAI.ts` → `resolveModelForTier()` → uses `runtimeTuning.models.textModel`
- **Status**: ⚠️ **PARTIALLY WIRED** (table mismatch)

### ✅ WIRED: Text Generation Parameters
- **Admin Control**: `admin_global_config.config.model.temperature`, `top_p`, `max_output`
- **MOBILE Consumer**: `fullAI.ts` → `runFullAI()` → uses `runtimeTuning.generation.*`
- **Status**: ⚠️ **PARTIALLY WIRED** (table mismatch)

### ❌ NOT WIRED: Reasoning Depth
- **Admin Control**: `admin_global_config.config.models.reasoning_depth`
- **MOBILE Consumer**: ⚠️ **NOT CONSUMED** - `runtimeTuning.models.reasoningDepth` is loaded but never used
- **Status**: ❌ **NOT WIRED**

### ✅ WIRED: Persona Controls (Text Mode)
- **Admin Control**: `admin_global_config.config.persona.*`, `behaviour.*`
- **MOBILE Consumer**: `personaSynth.ts` → blends into persona instruction
- **Status**: ⚠️ **PARTIALLY WIRED** (table mismatch)

### ❌ NOT WIRED: Max Tokens Enforcement
- **Admin Control**: `admin_global_config.config.model.max_output`
- **MOBILE Consumer**: `fullAI.ts` → uses `maxOutputTokens` in API call, but no hard enforcement
- **Status**: ⚠️ **PARTIALLY WIRED** (used but not enforced as hard limit)

---

## STEP 6: User Policy Path Audit

### ✅ WIRED: Disabled Status
- **Admin Control**: `user_metadata.status` = `'disabled'` or `'blocked'`
- **MOBILE Consumer**: 
  - `session/page.tsx` → blocks `handleSend()` and `handleModeToggle()`
  - `realtime/offer/route.ts` → returns 403
  - `realtime/token/route.ts` → returns 403
- **Status**: ✅ **WIRED** (but admin UI cannot set it)

### ✅ WIRED: Plan Limits
- **Admin Control**: `user_metadata.plan` → maps to `planTier`
- **MOBILE Consumer**: `session/page.tsx` → uses `adminPolicy.planTier` for plan checks
- **Status**: ✅ **FULLY WIRED**

### ✅ WIRED: Realtime Enabled
- **Admin Control**: `user_metadata.voice_enabled` / `realtime_beta`
- **MOBILE Consumer**: 
  - `session/page.tsx` → blocks voice mode toggle
  - `realtime/offer/route.ts` → returns 403
  - `realtime/token/route.ts` → returns 403
- **Status**: ✅ **WIRED** (but admin UI cannot set it)

### ⚠️ PARTIALLY WIRED: Token Adjustments
- **Admin Control**: `user_metadata.token_balance`
- **MOBILE Consumer**: `loadAdminUserPolicy()` → loads `hardTokenCap` but never enforces it
- **Status**: ⚠️ **PARTIALLY WIRED** - Data flows but not enforced

---

## STEP 7: Final Categorization

### ✅ FULLY WIRED ITEMS
1. **User Plan Updates** - Complete flow: UI → API → Supabase → MOBILE → Runtime
2. **Token Balance Adjustments** - Complete flow (but not enforced as hard cap)

### ⚠️ PARTIALLY WIRED ITEMS (Needs Attention)

#### Critical Fixes Required:
1. **AI Configuration Table Sync** - Admin writes to `admin_global_config`, MOBILE reads from `admin_ai_config`
   - **Impact**: All AI tuning controls are broken
   - **Priority**: 🔴 **CRITICAL**

2. **User Status Control** - UI exists, no API route
   - **Impact**: Cannot disable/block users
   - **Priority**: 🔴 **CRITICAL**

3. **Voice Enabled Control** - UI exists, no API route
   - **Impact**: Cannot enable/disable voice per user
   - **Priority**: 🔴 **CRITICAL**

4. **Realtime Beta Control** - UI exists, no API route
   - **Impact**: Cannot control realtime beta access
   - **Priority**: 🔴 **CRITICAL**

#### Medium Priority:
5. **Admin Notes** - UI exists, no API route, not consumed
6. **Token Hard Cap Enforcement** - Data loaded but not enforced
7. **Feedback API Route** - UI exists, no data source

#### Low Priority (Unused Controls):
8. **Automation Toggles** - Loaded but never checked in runtime
9. **Hidden Modules** - Loaded but never checked in runtime
10. **Persona Instruction Override** - Loaded but never used
11. **Memory Selectivity/RAG/Emotional Weighting** - Loaded but never used
12. **Safety Toggles** - Loaded but never checked
13. **Safety Output Smoothing** - Loaded but never used
14. **Reasoning Depth** - Loaded but never used in model selection

### ❌ NOT WIRED AT ALL (Fix Immediately)

1. **AI Configuration Sync** - Admin panel and MOBILE use different tables
2. **User Status API** - No way to set user status from admin UI
3. **Voice Enabled API** - No way to set voice enabled from admin UI
4. **Realtime Beta API** - No way to set realtime beta from admin UI
5. **Feedback Data Source** - Feedback page has no API route

---

## Recommendations

### Immediate Actions (Critical):
1. **Fix table mismatch**: Either sync `admin_global_config` → `admin_ai_config` on save, or change MOBILE to read from `admin_global_config`
2. **Add missing API routes**: 
   - `POST /api/admin/users/update-status`
   - `POST /api/admin/users/update-voice-enabled`
   - `POST /api/admin/users/update-realtime-beta`
   - `POST /api/admin/users/update-notes`
3. **Add feedback API**: `GET /api/admin/feedback/list`

### Short-term Actions (High Priority):
4. **Enforce token hard cap**: Use `adminPolicy.hardTokenCap` in token consumption logic
5. **Wire automation flags**: Add checks for `runtimeTuning.automation.*` in appropriate runtime locations
6. **Wire hidden modules**: Add checks for `config.hidden_modules.*` if these features exist

### Long-term Actions (Low Priority):
7. **Wire unused memory controls**: Implement `selectivity`, `ragRecallStrength`, `emotionalWeighting` in memory system
8. **Wire safety toggles**: Implement boolean safety flags in safety system
9. **Wire reasoning depth**: Use `reasoningDepth` in model selection logic
10. **Wire persona instruction override**: Use `config.persona_instruction` if custom instructions are needed

---

## Summary Statistics

- **Total Admin Controls**: ~50+ (sliders, toggles, dropdowns, textareas)
- **Fully Wired**: 2 (4%)
- **Partially Wired**: 30+ (60%)
- **Not Wired**: 18+ (36%)
- **Critical Issues**: 5
- **Missing API Routes**: 5
- **Unused Runtime Controls**: 14+

**Overall Status**: ⚠️ **PARTIALLY FUNCTIONAL** - Core flows work but many controls are disconnected or unused.

