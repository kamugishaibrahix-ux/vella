============================
Admin UI Wiring Status Report
============================

Generated: Comprehensive audit of all admin pages and components
Mode: SCAN ONLY - No modifications made

=========================================================
[PAGE SUMMARY]
=========================================================

| Page | Status | Notes |
|------|--------|-------|
| /dashboard | PARTIAL | Mock metrics, hardcoded alerts, static system status |
| /users | PARTIAL | Core features wired; blockUploads, shadowBan, Export CSV unwired |
| /subscriptions | PARTIAL | Status updates wired; plan editing, bulk ops, refunds, promo codes unwired |
| /logs | PARTIAL | Log viewing wired; alert rules, live tail, time filtering unwired |
| /feedback | PARTIAL | Feedback table wired; alerts, reports, ratings, export unwired |
| /ai-configuration | PASS | Fully wired and functional |
| /insights | PASS | Fully wired and functional |
| /system-settings | PASS | Fully wired and functional |
| /content-library | PASS | Fully wired and functional |

=========================================================
[UNWIRED ELEMENTS]
=========================================================

[PAGE] /dashboard
[COMPONENT] app/dashboard/page.tsx

Issue 1: Hardcoded dashboard metrics
- Lines 19-56: `dashboardMetrics` array contains hardcoded values
- "Daily Active Users" (4,032), "Monthly Recurring Revenue" ($182K), "Active Sessions" (312) are static
- Only "Total Users", "Active Subscriptions", and "Tokens Used" pull from API
- Classification: B (API exists - `/api/admin/analytics/get` returns data, but UI doesn't use all fields)
- Reason: API returns `analytics_counters` but UI expects specific metric names that may not match
- Suggested fix: Map API response to metric cards, or extend API to return these specific metrics

Issue 2: Hardcoded system status cards
- Lines 157-168: API status, DB load (42%), Realtime health are hardcoded
- Classification: B (Can be wired - system_logs or analytics_counters could provide this)
- Reason: No API endpoint exists for system health metrics
- Suggested fix: Create `/api/admin/system-health/route.ts` that queries system_logs and analytics_counters

Issue 3: Hardcoded alerts array
- Lines 58-77: `alerts` array is static mock data
- Classification: B (Can be wired - system_logs could provide alerts)
- Reason: No API endpoint exists for system alerts
- Suggested fix: Create `/api/admin/alerts/route.ts` that filters system_logs by severity/type

Issue 4: SystemAlert component action button
- components/dashboard/SystemAlert.tsx line 23: Button has `actionLabel` prop but no onClick handler
- Classification: A (UI-only issue - button exists but does nothing)
- Reason: No handler passed to component
- Suggested fix: Add onClick handler prop to SystemAlert, wire to alert acknowledgment API

Issue 5: EngagementPanel mock data
- components/dashboard/EngagementPanel.tsx lines 13-21: Hardcoded engagement data
- components/dashboard/EngagementChart.tsx lines 13-21: Hardcoded chart data
- Classification: B (Can be wired - would need engagement metrics API)
- Reason: No API endpoint exists for engagement metrics
- Suggested fix: Create `/api/admin/engagement/route.ts` that aggregates session data

[PAGE] /users
[COMPONENT] app/users/page.tsx

Issue 1: Export CSV button
- Line 353-356: "Export CSV" button has no onClick handler
- Classification: A (Can be wired - just needs handler)
- Reason: No handler implemented
- Suggested fix: Add handler that generates CSV from `users` state and triggers download

Issue 2: Block file uploads toggle
- Lines 644-656: Toggle exists but only updates local state (`drawerState.blockUploads`)
- No API call to persist this setting
- Classification: C (Cannot be wired - no `block_uploads` field in user_metadata table)
- Reason: Field doesn't exist in schema
- Suggested fix: Either add field to user_metadata (requires migration) or remove UI element

Issue 3: Shadow-ban toggle
- Lines 667-680: Toggle exists but only updates local state (`drawerState.shadowBan`)
- No API call to persist this setting
- Classification: C (Cannot be wired - no `shadow_ban` field in user_metadata table)
- Reason: Field doesn't exist in schema
- Suggested fix: Either add field to user_metadata (requires migration) or remove UI element

Issue 4: Reset allocation button
- Lines 338-343: `resetAllocation` action only updates local state, doesn't call API
- Classification: B (Can be wired - would call `updateUserTokens` with calculated delta)
- Reason: Logic exists but not wired
- Suggested fix: Calculate delta and call `updateUserTokens(userId, delta)` where delta = tokensPerMonth - tokenBalance

[PAGE] /subscriptions
[COMPONENT] app/subscriptions/page.tsx

Issue 1: Plan Overview editing
- Lines 231-242: `handlePlanChange` and `handleSavePlan` only update local state
- `handleSavePlan` calls `console.log` only (line 239)
- Classification: C (Cannot be wired - no plan templates table exists)
- Reason: Plan definitions are not stored in database, only individual subscriptions
- Suggested fix: Either create plan_templates table (requires migration) or remove plan editing UI

Issue 2: Bulk operations
- Lines 244-247: `handleBulkAction` calls `console.log` only
- "Recalculate token entitlements" and "Sync plans from Stripe" buttons do nothing
- Classification: B (Can be wired - would need new API routes)
- Reason: No API endpoints exist for bulk operations
- Suggested fix: Create `/api/admin/subscriptions/bulk-recalculate` and `/api/admin/subscriptions/sync-stripe` routes

Issue 3: Refund functionality
- Lines 283-288: `handleRefund` calls `console.log` only
- Classification: C (Cannot be wired - requires Stripe integration, no refund table)
- Reason: Requires external Stripe API integration and refund tracking table
- Suggested fix: Requires Stripe webhook integration and refunds table (migrations needed)

Issue 4: Create Promo Code dialog
- Lines 296-335: Dialog has form inputs but "Save promo" button (line 332) has no handler
- Classification: C (Cannot be wired - no promo_codes table exists)
- Reason: No table exists for promo codes
- Suggested fix: Requires promo_codes table (migration needed)

Issue 5: MRR and Token Pack Revenue metrics
- Lines 33-39, 58-64: Hardcoded values with TODO comments
- Classification: B (Can be wired - would need billing aggregation API)
- Reason: No API endpoint exists for revenue metrics
- Suggested fix: Create `/api/admin/revenue/route.ts` that aggregates subscription data (if price data exists in subscriptions table)

Issue 6: Churn rate calculation
- Lines 198-216: Calculated from subscriptions but uses hardcoded base value
- Classification: A (Partially wired - uses real data but calculation may be incomplete)
- Reason: Uses subscription data but may need historical data for accurate churn
- Suggested fix: Verify calculation logic matches business requirements

[PAGE] /logs
[COMPONENT] app/logs/page.tsx

Issue 1: Time range filter
- Lines 128-143: Buttons exist but don't filter logs (only UI state)
- Classification: B (Can be wired - API supports date filtering)
- Reason: `/api/admin/logs/list` doesn't accept query params for time range
- Suggested fix: Add query params to API route (`?since=15m`) and filter in backend

Issue 2: Live tail toggle
- Line 173: Switch exists but doesn't enable polling/SSE
- Classification: B (Can be wired - would need polling or SSE implementation)
- Reason: No real-time log streaming implemented
- Suggested fix: Add polling interval when `liveTail` is true, or implement SSE

Issue 3: Alert rules management
- Lines 70-73: Hardcoded alert rules array
- Lines 238-280: Rules can be edited in UI but changes only update local state
- Line 274: "Edit" button calls `console.log` only
- Classification: B (Can be wired - would need alert_rules table or use admin_ai_config)
- Reason: No table exists for alert rules
- Suggested fix: Store alert rules in `admin_ai_config` with `label = "alert_rules"` or create alert_rules table

Issue 4: Create alert rule from log
- Lines 329-337: Button calls `console.log` only
- Classification: B (Same as Issue 3 - can use admin_ai_config)
- Suggested fix: Wire to same alert rules storage

Issue 5: Log metrics (AI latency, DB load, API uptime)
- Lines 16-41: Hardcoded values
- Classification: B (Can be wired - would need metrics aggregation API)
- Reason: No API endpoint exists for these specific metrics
- Suggested fix: Create `/api/admin/metrics/route.ts` that aggregates from system_logs and analytics_counters

[PAGE] /feedback
[COMPONENT] app/feedback/page.tsx

Issue 1: System Alerts section
- Lines 48-73: `initialAlerts` array is hardcoded mock data
- Lines 157-161: `acknowledgeAlert` only updates local state
- Lines 163-167: `toggleMute` only updates local state
- Classification: B (Can be wired - would need alerts table or use system_logs)
- Reason: No alerts table exists
- Suggested fix: Create alerts table or derive from system_logs with severity filtering

Issue 2: Ratings & Sentiment Summary
- Lines 243-265: Hardcoded values (4.3 rating, 1,240 responses, 68% positive, etc.)
- Classification: B (Can be wired - feedback table has rating field)
- Reason: API exists but UI doesn't calculate aggregates
- Suggested fix: Calculate from `feedback` table data: average rating, sentiment breakdown

Issue 3: Export feedback CSV
- Line 174: `handleExportFeedback` calls `console.log` only
- Classification: A (Can be wired - just needs CSV generation)
- Reason: No handler implementation
- Suggested fix: Generate CSV from `feedback` state array and trigger download

Issue 4: User Reports section
- Lines 75-103: `initialReports` array is hardcoded mock data
- Lines 169-171: `updateReport` only updates local state
- Classification: C (Cannot be wired - no reports table exists)
- Reason: No table exists for user reports
- Suggested fix: Requires reports table (migration needed) or remove UI

Issue 5: Report resolution
- Lines 422-428: "Mark resolved" button calls `console.log` only
- Classification: C (Same as Issue 4 - no reports table)
- Suggested fix: Requires reports table

Issue 6: Flag user for review toggle
- Line 396: Toggle exists but only updates local state
- Classification: C (Cannot be wired - no flagged_users field in user_metadata)
- Reason: Field doesn't exist in schema
- Suggested fix: Either add field (migration) or remove UI element

[PAGE] /ai-configuration
[COMPONENT] app/ai-configuration/page.tsx

Status: PASS - All features fully wired
- All sliders, toggles, and inputs are bound to state
- Save functionality calls `/api/admin/config/save`
- Load functionality calls `/api/admin/config/get`
- No unwired elements detected

[PAGE] /insights
[COMPONENT] app/insights/page.tsx

Status: PASS - All features fully wired
- All metrics pull from `/api/admin/insights/overview`
- No unwired elements detected

[PAGE] /system-settings
[COMPONENT] app/system-settings/page.tsx

Status: PASS - All features fully wired
- All toggles and inputs are bound to state
- Save functionality calls `/api/admin/system-settings/save`
- Load functionality calls `/api/admin/system-settings/get`
- No unwired elements detected

[PAGE] /content-library
[COMPONENT] app/content-library/page.tsx

Status: PASS - All features fully wired
- List, create, update, delete all call respective APIs
- No unwired elements detected

=========================================================
[API MISMATCHES]
=========================================================

1. Dashboard metrics expectations
   - UI expects: total_users, active_subscriptions, total_tokens_used, daily_active_users, mrr, active_sessions
   - API returns: analytics_counters (key-value pairs)
   - Mismatch: API shape doesn't match UI expectations
   - Location: app/dashboard/page.tsx lines 109-128

2. Analytics response shape
   - UI expects: AdminAnalytics (Record<string, number>)
   - API returns: { success: true, data: counters, tokenUsage }
   - Mismatch: API includes tokenUsage but UI doesn't use it
   - Location: lib/api/adminAnalyticsClient.ts vs app/api/admin/analytics/get/route.ts

=========================================================
[MOCK / HARDCODED DATA]
=========================================================

1. app/dashboard/page.tsx
   - Lines 19-56: dashboardMetrics array (hardcoded values for DAU, MRR, Active Sessions)
   - Lines 58-77: alerts array (hardcoded system alerts)
   - Lines 157-168: System status cards (hardcoded "Operational", "42%", "Stable")

2. components/dashboard/EngagementPanel.tsx
   - Lines 13-21: Hardcoded engagement statistics
   - Lines 24-29: Hardcoded bullet points

3. components/dashboard/EngagementChart.tsx
   - Lines 13-21: Hardcoded engagementData array

4. app/subscriptions/page.tsx
   - Lines 31-66: subscriptionMetrics array (hardcoded MRR, Token Pack Revenue)
   - Lines 68-96: planOverview array (hardcoded plan definitions)
   - Lines 225: Hardcoded "mrr: '--'" in recentEvents

5. app/logs/page.tsx
   - Lines 16-41: logMetrics array (hardcoded AI latency, DB load, API uptime)
   - Lines 70-73: alertRules array (hardcoded alert rules)

6. app/feedback/page.tsx
   - Lines 48-73: initialAlerts array (hardcoded system alerts)
   - Lines 75-103: initialReports array (hardcoded user reports)
   - Lines 243-265: Hardcoded ratings and sentiment data (4.3 rating, percentages)

=========================================================
[DEAD / UNUSED UI]
=========================================================

1. components/subscriptions/PlanManageDrawer.tsx
   - Status: UNUSED
   - Reason: Component exists but never imported or rendered
   - Location: No imports found in codebase

2. components/subscriptions/EventActionsMenu.tsx
   - Status: UNUSED
   - Reason: Component exists but never imported or rendered
   - Location: No imports found in codebase

3. app/subscriptions/page.tsx - Plan Overview section
   - Status: PARTIALLY DEAD
   - Reason: UI exists and is interactive, but "Save plan" does nothing (console.log only)
   - Lines 345-403: Entire plan editing section is non-functional

4. app/logs/page.tsx - Alert rules section
   - Status: PARTIALLY DEAD
   - Reason: UI exists and toggles work locally, but "Edit" button does nothing
   - Lines 233-282: Alert rules panel is non-functional

5. app/feedback/page.tsx - System Alerts section
   - Status: PARTIALLY DEAD
   - Reason: UI exists but alerts are mock data, actions only update local state
   - Lines 184-221: Alerts section is non-functional

6. app/feedback/page.tsx - User Reports section
   - Status: PARTIALLY DEAD
   - Reason: UI exists but reports are mock data, actions only update local state
   - Lines 306-373: Reports section is non-functional

=========================================================
[BACKEND LIMITATIONS]
=========================================================

The following UI elements CANNOT be wired without schema changes (migrations):

1. User Management - Block file uploads toggle
   - Required: `user_metadata.block_uploads` column (boolean)
   - Current: Field doesn't exist
   - Location: app/users/page.tsx lines 644-656

2. User Management - Shadow-ban toggle
   - Required: `user_metadata.shadow_ban` column (boolean)
   - Current: Field doesn't exist
   - Location: app/users/page.tsx lines 667-680

3. Subscriptions - Plan template editing
   - Required: `plan_templates` table with columns: id, name, token_allocation, seat_limit, price, allow_realtime
   - Current: No table exists
   - Location: app/subscriptions/page.tsx lines 345-403

4. Subscriptions - Promo codes
   - Required: `promo_codes` table with columns: id, code, discount_percent, applies_to_plan, is_active, created_at
   - Current: No table exists
   - Location: app/subscriptions/page.tsx lines 296-335

5. Subscriptions - Refunds
   - Required: `refunds` table and Stripe integration
   - Current: No table exists, no Stripe integration
   - Location: app/subscriptions/page.tsx lines 283-288, 540-555

6. Feedback - User Reports
   - Required: `user_reports` table with columns: id, user_id, type, severity, status, assignee, summary, notes, created_at
   - Current: No table exists
   - Location: app/feedback/page.tsx lines 306-373

7. Feedback - Flag user for review
   - Required: `user_metadata.flagged_for_review` column (boolean)
   - Current: Field doesn't exist
   - Location: app/feedback/page.tsx line 396

8. Logs - Alert rules persistence
   - Required: `alert_rules` table OR use admin_ai_config with label="alert_rules"
   - Current: No table exists (but can use admin_ai_config as workaround)
   - Location: app/logs/page.tsx lines 233-282

=========================================================
[SUMMARY BY CLASSIFICATION]
=========================================================

**Classification A - Can Be Wired (API exists or simple fix):**
- Dashboard: SystemAlert action button
- Users: Export CSV button, Reset allocation button
- Feedback: Export feedback CSV, Ratings calculation
- Logs: Time range filtering (add query params)

**Classification B - Can Be Wired (API doesn't exist but can be created safely):**
- Dashboard: System health metrics API, Alerts API, Engagement metrics API
- Subscriptions: Bulk operations APIs, Revenue metrics API
- Logs: Metrics aggregation API, Alert rules (use admin_ai_config)
- Feedback: Alerts (derive from system_logs), Ratings aggregation

**Classification C - Cannot Be Wired (requires migrations):**
- Users: Block uploads, Shadow-ban
- Subscriptions: Plan templates, Promo codes, Refunds
- Feedback: User reports, Flag user
- Logs: Alert rules (if not using admin_ai_config workaround)

=========================================================
[RECOMMENDATIONS]
=========================================================

**High Priority (Easy Wins - Classification A):**
1. Wire Export CSV buttons (users, feedback)
2. Wire Reset allocation button (users)
3. Calculate ratings from feedback data (feedback)
4. Add time range query params to logs API

**Medium Priority (New APIs - Classification B):**
1. Create system health metrics API
2. Create alerts API (from system_logs)
3. Create engagement metrics API
4. Create revenue metrics API
5. Create bulk operations APIs
6. Store alert rules in admin_ai_config

**Low Priority (Requires Decisions - Classification C):**
1. Decide if block_uploads and shadow_ban are needed → add migrations if yes
2. Decide if plan templates are needed → add migrations if yes
3. Decide if promo codes are needed → add Stripe integration + migrations if yes
4. Decide if user reports are needed → add migrations if yes
5. Remove dead UI if features are not planned

**Dead Code Cleanup:**
1. Remove or wire PlanManageDrawer component
2. Remove or wire EventActionsMenu component
3. Remove plan editing UI if not planning plan templates feature
4. Remove user reports UI if not planning reports feature

=========================================================
END OF REPORT
=========================================================





