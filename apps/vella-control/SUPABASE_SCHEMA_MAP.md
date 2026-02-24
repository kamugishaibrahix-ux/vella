============================
Supabase Schema Map (Detected)
============================

Generated from codebase analysis - all table and column names inferred from actual code usage.

[TABLE] user_metadata
- Columns referenced:
  - user_id: string (UUID, primary key)
  - plan: string
  - token_balance: number
  - token_refill_at: string | null
  - created_at: string
  - updated_at: string
  - email: string | null
  - full_name: string | null
  - status: string | null (enum: "active" | "suspended" | "banned")
  - last_active_at: string | null
  - voice_enabled: boolean | null
  - realtime_beta: boolean | null
  - admin: boolean | null
  - tokens_per_month: number | null
  - notes: string | null (max 500 chars)
- JSON capable? Unknown (no JSONB columns explicitly referenced)
- Likely purpose: user (per-user account data, plan, tokens, flags)
- Suggested use possibilities:
  - insights: yes (user metrics, activity, plan distribution)
  - system-settings: no (user-specific, not system-wide)
  - content-library: no (not content storage)

[TABLE] subscriptions
- Columns referenced:
  - id: string (primary key)
  - user_id: string
  - status: string (enum: "active" | "canceled" | "cancelled" | "past_due" | "trialing" | "paused")
  - plan: string
  - renews_at: string | null
  - cancel_at: string | null
  - created_at: string
  - updated_at: string
- JSON capable? Unknown (no JSONB columns explicitly referenced)
- Likely purpose: user (subscription lifecycle data)
- Suggested use possibilities:
  - insights: yes (subscription metrics, churn, revenue)
  - system-settings: no (user-specific)
  - content-library: no (not content storage)

[TABLE] admin_ai_config
- Columns referenced:
  - id: string (primary key, used in upsert)
  - config: JSONB (stores AdminConfig object with persona, behaviour, voice, model, memory, safety, hidden_modules, automation, persona_instruction)
  - is_active: boolean
  - created_at: string
  - updated_at: string
  - label: string | null
- JSON capable? YES (config is JSONB)
- Likely purpose: config (system-wide AI configuration)
- Suggested use possibilities:
  - insights: no (config storage, not analytics)
  - system-settings: YES (already used for AI config, can extend for other system settings)
  - content-library: YES (can store content items in config JSONB or use label + config structure)

[TABLE] admin_activity_log
- Columns referenced:
  - id: string (primary key)
  - admin_id: string (UUID, references admin user)
  - action: string (e.g., "users.update-plan", "config.save", "subscriptions.update-status")
  - previous: unknown (likely JSONB, stores previous state)
  - next: unknown (likely JSONB, stores new state)
  - created_at: string
- JSON capable? YES (previous and next appear to be JSONB based on usage)
- Likely purpose: logs (audit trail of admin actions)
- Suggested use possibilities:
  - insights: yes (admin activity patterns, change frequency)
  - system-settings: no (audit log, not settings storage)
  - content-library: no (audit log, not content storage)

[TABLE] token_usage
- Columns referenced:
  - id: string
  - tokens: number
  - from_allocation: boolean (or similar)
  - created_at: string
  - used_at: string (used for ordering)
- JSON capable? Unknown (no JSONB columns explicitly referenced)
- Likely purpose: analytics (token consumption tracking)
- Suggested use possibilities:
  - insights: YES (token usage patterns, consumption trends)
  - system-settings: no (analytics data)
  - content-library: no (not content storage)

[TABLE] token_ledger
- Columns referenced:
  - user_id: string (UUID)
  - delta: number (token adjustment amount)
  - reason: string (e.g., "admin_adjustment")
- JSON capable? Unknown (no JSONB columns explicitly referenced)
- Likely purpose: tokens (audit trail for token changes)
- Suggested use possibilities:
  - insights: yes (token adjustment patterns, admin intervention frequency)
  - system-settings: no (ledger data)
  - content-library: no (not content storage)

[TABLE] analytics_counters
- Columns referenced:
  - key: string (counter identifier)
  - value: number (counter value)
- JSON capable? Unknown (simple key-value structure)
- Likely purpose: analytics (aggregated metrics)
- Suggested use possibilities:
  - insights: YES (dashboard metrics, system health)
  - system-settings: no (metrics, not settings)
  - content-library: no (not content storage)

[TABLE] system_logs
- Columns referenced:
  - id: string
  - type: string | null
  - message: string | null
  - action: string | null
  - created_at: string
- JSON capable? Unknown (no JSONB columns explicitly referenced, but may have additional fields)
- Likely purpose: logs (system-level logging)
- Suggested use possibilities:
  - insights: yes (system health, error patterns, performance)
  - system-settings: no (log data)
  - content-library: no (not content storage)

[TABLE] feedback
- Columns referenced:
  - id: string
  - user_id: string
  - session_id: string | null
  - channel: "voice" | "text" (enum)
  - rating: number | null
  - category: string | null
  - created_at: string
- JSON capable? Unknown (no JSONB columns explicitly referenced)
- Likely purpose: user (user feedback data)
- Suggested use possibilities:
  - insights: yes (sentiment analysis, feedback trends, rating distribution)
  - system-settings: no (user feedback)
  - content-library: no (not content storage)

============================
Summary Recommendations
============================

Table to use for system settings:
- PRIMARY: admin_ai_config
  - Already has JSONB `config` column
  - Has `is_active` flag for versioning
  - Has `label` for categorization
  - Can store multiple config types by using `label` to differentiate (e.g., "ai_config", "system_settings", "feature_flags")
  - Supports upsert pattern already established
  - Has audit trail via admin_activity_log

Table to use for content library:
- PRIMARY: admin_ai_config (extended usage)
  - Use `label` field to mark content items (e.g., "content_exercise", "content_stoic", "content_analysis")
  - Store content metadata and body in `config` JSONB
  - Use `is_active` to enable/disable content items
  - Can query by label to filter content types
  - Supports versioning via multiple rows with same label but different is_active

- ALTERNATIVE: user_metadata (if per-user content needed)
  - Could use `notes` field for small content, but limited to 500 chars
  - Not ideal for content library (user-specific, not shared)

Tables available for insights:
- analytics_counters: Key-value metrics (total users, active subscriptions, tokens used)
- token_usage: Token consumption patterns, usage trends
- token_ledger: Token adjustment history, admin intervention patterns
- system_logs: System health, error rates, performance metrics
- admin_activity_log: Admin action frequency, change patterns
- feedback: Sentiment analysis, rating trends, feedback categories
- user_metadata: User growth, plan distribution, feature adoption (voice_enabled, realtime_beta)
- subscriptions: Subscription lifecycle, churn analysis, plan migration patterns

Tables available for read-only analytics:
- analytics_counters: Pre-aggregated counters
- token_usage: Historical token consumption
- token_ledger: Token change audit trail
- system_logs: System event history
- admin_activity_log: Admin action history
- feedback: User feedback history
- user_metadata: User account data (read-only for analytics)
- subscriptions: Subscription history (read-only for analytics)

============================
Enums Detected
============================

Status Enums:
- user_metadata.status: "active" | "suspended" | "banned"
- subscriptions.status: "active" | "canceled" | "cancelled" | "past_due" | "trialing" | "paused"
- feedback.channel: "voice" | "text"

Config Enums:
- AdminConfig.models.reasoning_depth: "Light" | "Normal" | "Analytical" | "Deep"

============================
JSON/JSONB Columns Identified
============================

1. admin_ai_config.config: JSONB
   - Stores AdminConfig object with nested structures
   - Contains: persona, behaviour, voice, model, models, memory, safety, hidden_modules, automation, persona_instruction
   - Already used for AI configuration
   - Can be extended for other config types

2. admin_activity_log.previous: Likely JSONB
   - Stores previous state before admin action
   - Used for audit trail

3. admin_activity_log.next: Likely JSONB
   - Stores new state after admin action
   - Used for audit trail

============================
RPC Functions
============================

No RPC functions or Postgres functions detected in the codebase.
All database access uses standard Supabase client methods (.from(), .select(), .insert(), .update()).

============================
Additional Notes
============================

1. admin_ai_config is the most flexible table for storing:
   - System settings (extend current usage)
   - Content library items (use label to differentiate)
   - Feature flags (use label + config JSONB)
   - Any JSON-structured admin data

2. The pattern for multi-purpose use of admin_ai_config:
   - Use `label` as a type discriminator (e.g., "ai_config", "system_settings", "content_exercise")
   - Store type-specific data in `config` JSONB
   - Use `is_active` for enable/disable or versioning
   - Query with `.eq("label", "content_type")` to filter

3. For insights, all tables provide valuable data:
   - Real-time: analytics_counters (pre-aggregated)
   - Historical: token_usage, token_ledger, system_logs, admin_activity_log, feedback
   - User metrics: user_metadata, subscriptions

4. No dedicated content or template tables exist - admin_ai_config must be repurposed for content library.

