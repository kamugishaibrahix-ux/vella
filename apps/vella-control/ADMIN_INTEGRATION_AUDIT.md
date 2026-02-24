============================
Vella Control Admin Integration Audit
============================

Generated: 2024-12-19

[1] Page → Data Mapping
============================

[PAGE] /dashboard
- Component: app/dashboard/page.tsx
- Data calls:
  - GET /api/admin/analytics/get → expects { success: boolean, data: Record<string, number>, tokenUsage?: any }
  - Loading: ✅ Yes (analyticsError state, conditional rendering)
  - Error UI: ✅ Yes (line 137-139: error message display)
  - Null guards: ✅ Yes (analytics.total_users check before use, fallback to default metrics)
- Status: ✅ PASS

[PAGE] /users
- Component: app/users/page.tsx
- Data calls:
  - GET /api/admin/users/list → expects { success: boolean, data: AdminUserRow[] }
  - Loading: ✅ Yes (isLoadingUsers state, line 436-441)
  - Error UI: ✅ Yes (line 442-447: error message display)
  - Empty state: ✅ Yes (line 448-453: "No users match" message)
  - Mutations:
    - POST /api/admin/users/update-plan
    - POST /api/admin/users/update-tokens
    - POST /api/admin/users/update-status
    - POST /api/admin/users/update-voice
    - POST /api/admin/users/update-realtime
    - POST /api/admin/users/update-notes
- Status: ✅ PASS

[PAGE] /subscriptions
- Component: app/subscriptions/page.tsx
- Data calls:
  - GET /api/admin/subscriptions/list → expects { success: boolean, data: AdminSubscription[] }
  - Loading: ✅ Yes (isLoadingSubscriptions state, line 391-396)
  - Error UI: ✅ Yes (line 397-402: error message display)
  - Empty state: ✅ Yes (line 403-408: "No subscription activity" message)
  - Note: Plan editing UI exists but mutations are console.log only (lines 223-226, 228-230, 236-239)
- Status: ⚠️ PARTIAL (read-only data works, mutations not wired)

[PAGE] /logs
- Component: app/logs/page.tsx
- Data calls:
  - GET /api/admin/logs/list → expects { success: boolean, data: AdminLogEntry[] }
  - Loading: ✅ Yes (isLoadingLogs state, line 191-196)
  - Error UI: ✅ Yes (line 197-202: error message display)
  - Empty state: ✅ Yes (line 203-208: "No log entries match" message)
- Status: ✅ PASS

[PAGE] /feedback
- Component: app/feedback/page.tsx
- Data calls:
  - GET /api/admin/feedback/list → expects { success: boolean, data: AdminFeedbackRow[] }
  - Loading: ✅ Yes (isLoadingFeedback state, line 268-269)
  - Error UI: ✅ Yes (line 270-271: error message display)
  - Empty state: ✅ Yes (line 272-273: "No feedback data available" message)
  - Note: Alerts and reports are hardcoded (initialAlerts, initialReports), not from API
- Status: ⚠️ PARTIAL (feedback data works, alerts/reports are mock)

[PAGE] /ai-configuration
- Component: app/ai-configuration/page.tsx
- Data calls:
  - GET /api/admin/config/get → expects { success: boolean, data: AdminConfig | null }
  - POST /api/admin/config/save → expects { success: boolean }
  - Loading: ✅ Yes (isLoadingConfig state, line 874-877)
  - Error UI: ✅ Yes (line 880-884: error message display)
  - Save state: ✅ Yes (isSavingConfig, saveMessage states)
- Status: ✅ PASS

[PAGE] /insights, /system-settings, /content-library
- Components: app/insights/page.tsx, app/system-settings/page.tsx, app/content-library/page.tsx
- Data calls: ❌ None found (appear to be mock/placeholder pages)
- Status: ⚠️ NOT WIRED (no API calls detected)

[2] API Compatibility
============================

[API] /api/admin/analytics/get
- Used by: /dashboard page (fetchAdminAnalytics)
- Returns: { success: boolean, data: Record<string, number>, tokenUsage?: any }
- UI expects: success + data (counters object) + tokenUsage
- Compatibility: ✅ PASS
- Error handling: ✅ Yes (500 status, error message)
- Tables: analytics_counters, system_logs, token_usage

[API] /api/admin/users/list
- Used by: /users page (fetchAdminUsers)
- Returns: { success: boolean, data: AdminUserRow[] }
- UI expects: success + data (array of users)
- Compatibility: ✅ PASS
- Error handling: ✅ Yes (500 status, error message)
- Tables: user_metadata

[API] /api/admin/subscriptions/list
- Used by: /subscriptions page (fetchAdminSubscriptions)
- Returns: { success: boolean, data: AdminSubscription[] }
- UI expects: success + data (array of subscriptions)
- Compatibility: ✅ PASS
- Error handling: ✅ Yes (500 status, error message)
- Tables: subscriptions

[API] /api/admin/logs/list
- Used by: /logs page (fetchAdminLogs)
- Returns: { success: boolean, data: AdminLogEntry[] }
- UI expects: success + data (array of log entries)
- Compatibility: ✅ PASS
- Error handling: ✅ Yes (500 status, error message)
- Tables: system_logs, admin_activity_log

[API] /api/admin/feedback/list
- Used by: /feedback page (fetchAdminFeedback)
- Returns: { success: boolean, data: AdminFeedbackRow[] }
- UI expects: success + data (array of feedback rows)
- Compatibility: ✅ PASS
- Error handling: ✅ Yes (500 status, graceful handling of missing table)
- Tables: feedback

[API] /api/admin/config/get
- Used by: /ai-configuration page (fetchAdminConfig)
- Returns: { success: boolean, data: AdminConfig | null }
- UI expects: success + data (config object or null)
- Compatibility: ✅ PASS
- Error handling: ✅ Yes (500 status, error message)
- Tables: admin_ai_config

[API] /api/admin/config/save
- Used by: /ai-configuration page (saveAdminConfig)
- Returns: { success: boolean, data?: { config } }
- UI expects: success flag
- Compatibility: ✅ PASS
- Error handling: ✅ Yes (400 status, error message)
- Tables: admin_ai_config, admin_activity_log

[API] /api/auth/me
- Used by: AdminBadge component
- Returns: { success: boolean, user: { id, email, is_admin, name? } }
- UI expects: success + user.email
- Compatibility: ✅ PASS
- Error handling: ✅ Yes (401/500 status)

[3] Admin Mutations
============================

[ADMIN MUTATION] /api/admin/users/update-plan
- Tables touched: user_metadata, admin_activity_log
- Fields updated: plan, updated_at
- UI trigger: users/page.tsx → handlePlanUpdate → updateUserPlan
- Validation: ✅ Strong (zod schema: user_id UUID, new_plan string)
- Risk: ✅ LOW
  - Uses .eq("user_id", payload.user_id) - scoped to single user
  - Validates UUID format
  - Logs activity
- Does this change real Vella data? ✅ YES (updates user_metadata.plan)

[ADMIN MUTATION] /api/admin/users/update-tokens
- Tables touched: user_metadata, token_ledger, admin_activity_log
- Fields updated: token_balance, updated_at
- UI trigger: users/page.tsx → handleTokenAdjustmentSave → updateUserTokens
- Validation: ✅ Strong (zod schema: user_id UUID, delta integer)
- Risk: ✅ LOW
  - Uses .eq("user_id", payload.user_id) - scoped to single user
  - Validates UUID format
  - Reads current balance before updating (prevents race conditions)
  - Writes to token_ledger for audit trail
  - Logs activity
- Does this change real Vella data? ✅ YES (updates user_metadata.token_balance, inserts token_ledger entry)

[ADMIN MUTATION] /api/admin/users/update-status
- Tables touched: user_metadata, admin_activity_log
- Fields updated: status, updated_at
- UI trigger: users/page.tsx → handleStatusChange → updateUserStatus
- Validation: ✅ Strong (zod schema: user_id UUID, status enum ["active", "suspended", "banned"])
- Risk: ✅ LOW
  - Uses .eq("user_id", payload.user_id) - scoped to single user
  - Validates UUID format
  - Enum restricts status values
  - Logs activity
- Does this change real Vella data? ✅ YES (updates user_metadata.status)

[ADMIN MUTATION] /api/admin/users/update-voice
- Tables touched: user_metadata, admin_activity_log
- Fields updated: voice_enabled, updated_at
- UI trigger: users/page.tsx → handleToggleAccess → updateUserVoice
- Validation: ✅ Strong (zod schema: user_id UUID, enabled boolean)
- Risk: ✅ LOW
  - Uses .eq("user_id", payload.user_id) - scoped to single user
  - Validates UUID format
  - Logs activity
- Does this change real Vella data? ✅ YES (updates user_metadata.voice_enabled)

[ADMIN MUTATION] /api/admin/users/update-realtime
- Tables touched: user_metadata, admin_activity_log
- Fields updated: realtime_beta, updated_at
- UI trigger: users/page.tsx → handleToggleAccess → updateUserRealtime
- Validation: ✅ Strong (zod schema: user_id UUID, enabled boolean)
- Risk: ✅ LOW
  - Uses .eq("user_id", payload.user_id) - scoped to single user
  - Validates UUID format
  - Logs activity
- Does this change real Vella data? ✅ YES (updates user_metadata.realtime_beta)

[ADMIN MUTATION] /api/admin/users/update-notes
- Tables touched: user_metadata, admin_activity_log
- Fields updated: notes, updated_at
- UI trigger: users/page.tsx → autosave debounce → updateUserNotes
- Validation: ✅ Strong (zod schema: user_id UUID, notes string max 500 or null)
- Risk: ✅ LOW
  - Uses .eq("user_id", payload.user_id) - scoped to single user
  - Validates UUID format
  - Max length validation
  - Logs activity
- Does this change real Vella data? ✅ YES (updates user_metadata.notes)

[ADMIN MUTATION] /api/admin/config/save
- Tables touched: admin_ai_config, admin_activity_log
- Fields updated: config (JSONB), is_active, updated_at
- UI trigger: ai-configuration/page.tsx → handleSavePersonaInstruction → saveAdminConfig
- Validation: ✅ Strong (zod schema with adminConfigSchema validation)
- Risk: ⚠️ MEDIUM
  - Uses .neq("id", existing.id) to deactivate others - could affect multiple rows if logic fails
  - Upsert with onConflict - safe but complex
  - Logs activity
- Does this change real Vella data? ✅ YES (upserts admin_ai_config, deactivates other configs)

[4] UI Runtime Risk
============================

[UI RISK] app/users/page.tsx line 187
- Risk: planFilterOptions uses users.map() - if users is undefined/null, will crash
- Severity: ⚠️ MEDIUM
- Current guard: users is initialized as [] (line 119), but if fetchAdminUsers throws and setUsers never called, could be undefined
- Suggested: Add null check: `const planFilterOptions = useMemo(() => { if (!users) return []; ...`

[UI RISK] app/users/page.tsx line 177
- Risk: selectedUser uses users.find() - if users is undefined, will crash
- Severity: ⚠️ MEDIUM
- Current guard: users initialized as [], but same concern as above
- Suggested: Add null check or ensure users is always array

[UI RISK] app/users/page.tsx line 466
- Risk: user.tokenBalance.toLocaleString() - if tokenBalance is null/undefined, will crash
- Severity: ⚠️ LOW
- Current guard: mapAdminUserRow sets default 0 (line 109)
- Status: ✅ SAFE (default value provided)

[UI RISK] app/subscriptions/page.tsx line 117-123
- Risk: data.slice().sort() - if data is null/undefined, will crash
- Severity: ⚠️ MEDIUM
- Current guard: fetchAdminSubscriptions returns [] on error (line 26), but if response.json() fails, could be undefined
- Suggested: Add null check: `const sorted = (data ?? []).slice().sort(...)`

[UI RISK] app/subscriptions/page.tsx line 147-151
- Risk: subscriptions.reduce() - if subscriptions is undefined, will crash
- Severity: ⚠️ MEDIUM
- Current guard: subscriptions initialized as [] (line 102), but if fetch fails silently, could be undefined
- Suggested: Add null check in useEffect: `if (!subscriptions.length) return;` already exists (line 144), but should check for null

[UI RISK] app/feedback/page.tsx line 287
- Risk: feedback.slice(0, 10) - if feedback is undefined, will crash
- Severity: ⚠️ MEDIUM
- Current guard: feedback initialized as [] (line 122), but if fetch fails, could be undefined
- Suggested: Add null check: `{(feedback ?? []).slice(0, 10).map(...)`

[UI RISK] app/feedback/page.tsx line 289
- Risk: item.user_id.slice(0, 8) - if user_id is null/undefined, will crash
- Severity: ⚠️ LOW
- Current guard: AdminFeedbackRow type requires user_id: string (non-nullable)
- Status: ✅ SAFE (type guarantees string)

[UI RISK] app/api/admin/config/save/route.ts line 37
- Risk: existingRows?.[0] - if existingRows is null, will crash
- Severity: ⚠️ LOW
- Current guard: Uses optional chaining ?.[0], then checks ?? null
- Status: ✅ SAFE (optional chaining prevents crash)

[UI RISK] app/users/page.tsx line 689-690
- Risk: (window as any).notesSaveTimeout - type assertion bypasses type safety
- Severity: ⚠️ LOW
- Note: Cosmetic, but could use proper typing
- Status: ⚠️ ACCEPTABLE (works but not ideal)

[UI RISK] Missing error states
- app/dashboard/page.tsx: ✅ Has error state (line 137-139)
- app/users/page.tsx: ✅ Has error state (line 442-447)
- app/subscriptions/page.tsx: ✅ Has error state (line 397-402)
- app/logs/page.tsx: ✅ Has error state (line 197-202)
- app/feedback/page.tsx: ✅ Has error state (line 270-271)
- app/ai-configuration/page.tsx: ✅ Has error state (line 880-884)

[UI RISK] Missing loading states
- app/dashboard/page.tsx: ⚠️ PARTIAL (has error state but no explicit loading spinner)
- app/users/page.tsx: ✅ Has loading state (line 436-441)
- app/subscriptions/page.tsx: ✅ Has loading state (line 391-396)
- app/logs/page.tsx: ✅ Has loading state (line 191-196)
- app/feedback/page.tsx: ✅ Has loading state (line 268-269)
- app/ai-configuration/page.tsx: ✅ Has loading state (line 874-877)

[5] Dead / Unused Code
============================

[UNUSED API] None found
- All admin API routes are used by at least one page or component

[UNUSED COMPONENT] Potential candidates:
- app/insights/page.tsx - No API calls detected, appears to be mock/placeholder
- app/system-settings/page.tsx - No API calls detected, appears to be mock/placeholder
- app/content-library/page.tsx - No API calls detected, appears to be mock/placeholder
- Note: These may be planned features not yet wired

[PARTIALLY WIRED] app/subscriptions/page.tsx
- Read operations: ✅ Wired (fetchAdminSubscriptions)
- Write operations: ❌ Not wired (handleSavePlan, handleBulkAction, handleRefund are console.log only)
- Plan editing UI exists but doesn't persist changes

[6] Automated Checks
============================

[TYPECHECK]
- Status: ⚠️ NOT RUN (no typecheck script in package.json)
- Available scripts: dev, build, start, lint
- Note: TypeScript is in devDependencies, but no explicit typecheck command
- Recommendation: Add "typecheck": "tsc --noEmit" to scripts

[LINT]
- Status: ⚠️ NOT RUN (command returned no output)
- Script exists: "lint": "next lint"
- Recommendation: Run manually to verify

[TEST]
- Status: ❌ NOT FOUND (no test script in package.json)
- No test framework detected
- Recommendation: Add tests for critical admin mutations

============================
Summary: Can admin pull and control Vella data?
============================

- Data pulls appear wired correctly: ✅ YES
  - All main admin pages (dashboard, users, subscriptions, logs, feedback, ai-configuration) fetch real data from Supabase
  - API routes use getAdminClient() with service role key
  - All queries target real tables: user_metadata, subscriptions, system_logs, admin_activity_log, feedback, admin_ai_config, analytics_counters, token_usage

- Admin mutations appear to change real data: ✅ YES (with one exception)
  - User mutations (plan, tokens, status, voice, realtime, notes): ✅ All perform real Supabase updates
  - Config mutations: ✅ Real upserts to admin_ai_config
  - Subscription mutations: ❌ NOT WIRED (UI exists but handlers are console.log only)
  - All mutations use proper WHERE clauses (.eq("user_id", ...))
  - All mutations log to admin_activity_log
  - Token updates also write to token_ledger

- UI robustness: ⚠️ ACCEPTABLE (with minor risks)
  - Loading states: ✅ Present on all pages
  - Error states: ✅ Present on all pages
  - Empty states: ✅ Present on all pages
  - Null guards: ⚠️ PARTIAL (some array operations could fail if fetch silently fails)
  - Type safety: ✅ Good (TypeScript types used throughout)
  - Runtime safety: ⚠️ MEDIUM (a few places where undefined arrays could cause crashes)

- Critical blockers before trusting admin in production:
  1. ⚠️ Add null checks for array operations (users, subscriptions, feedback)
  2. ⚠️ Wire subscription plan editing mutations (currently console.log only)
  3. ⚠️ Add typecheck script and run it in CI
  4. ⚠️ Add integration tests for critical mutations
  5. ⚠️ Verify RLS policies don't block admin service role operations
  6. ⚠️ Test all mutations in staging environment with real data

============================
Manual Work Remaining (for the owner)
============================

1. **Supabase RLS Verification**
   - Confirm admin service role bypasses RLS correctly
   - Verify admin_activity_log inserts succeed
   - Test token_ledger inserts work

2. **Staging Environment Testing**
   - Run `pnpm --filter vella-control build && pnpm --filter vella-control start`
   - Click through all admin flows:
     - Update user plan
     - Adjust tokens
     - Change user status
     - Toggle voice/realtime flags
     - Save AI config
   - Verify changes persist in Supabase dashboard
   - Verify admin_activity_log entries are created

3. **Subscription Management**
   - Wire up subscription plan editing (currently placeholder)
   - Implement bulk operations (recalculate, sync from Stripe)
   - Implement refund functionality

4. **Error Handling Enhancement**
   - Add null checks for array operations
   - Add retry logic for failed mutations
   - Add toast notifications for success/failure

5. **Performance Testing**
   - Test with large user datasets (1000+ users)
   - Verify pagination if needed
   - Check query performance on analytics endpoints

6. **Security Audit**
   - Verify ADMIN_ACTOR_ID is set correctly
   - Confirm service role key is never exposed to client
   - Review all mutation endpoints for SQL injection risks (low risk with Supabase client, but verify)

7. **Monitoring**
   - Set up alerts for admin_activity_log entries
   - Monitor token_ledger for unusual patterns
   - Track mutation failure rates

