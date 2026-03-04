/**
 * Phase 3.3: Redis Failure Policy Map
 *
 * Single source of truth for rate limit failure behavior.
 * Every sensitive endpoint must explicitly declare its policy.
 *
 * FAIL-CLOSED ("closed"): Deny when Redis is down
 * - Money-spending endpoints (OpenAI calls)
 * - Token charging endpoints
 * - Stripe webhooks
 * - Admin write operations
 *
 * FAIL-OPEN ("open"): Allow with local fallback when Redis is down
 * - Health endpoints
 * - Read-only endpoints with no OpenAI spend
 */

export type RateLimitPolicy = "open" | "closed";

/**
 * Rate limit policy for each sensitive endpoint.
 * Keys are route identifiers (not URLs).
 *
 * CRITICAL: Every sensitive route must have an explicit entry here.
 * No implicit defaults allowed.
 */
export const RATE_LIMIT_POLICY: Record<string, RateLimitPolicy> = {
  // Voice/Audio endpoints (spend money via OpenAI - FAIL CLOSED)
  audio_vella: "closed",

  // Realtime endpoints (spend tokens - FAIL CLOSED)
  realtime_offer: "closed",

  // Transcription (spends money - FAIL CLOSED)
  transcribe: "closed",

  // Insights (spends money via OpenAI - FAIL CLOSED)
  insights_generate: "closed",
  insights_patterns: "closed",

  // Admin write endpoints (sensitive operations - FAIL CLOSED)
  admin_suspend: "closed",
  admin_metadata_write: "closed",
  admin_user_update: "closed",

  // Stripe webhooks (payment critical - FAIL CLOSED)
  stripe_webhook: "closed",

  // Stripe checkout (payment - FAIL CLOSED)
  stripe_checkout: "closed",
  stripe_topup: "closed",

  // Token operations (spend/validate tokens - FAIL CLOSED)
  tokens_charge: "closed",
  tokens_refund: "closed",
  tokens_validate: "closed",

  // Health endpoint (monitoring - FAIL OPEN)
  system_health: "open",

  // Check-in (read/write user data, no OpenAI spend - FAIL OPEN)
  checkin_read: "open",
  checkin_write: "open",

  // Journal (user data - FAIL OPEN)
  journal_read: "open",
  journal_write: "open",

  // Focus areas (user data - FAIL OPEN)
  focus_areas_read: "open",
  focus_areas_write: "open",

  // Session management (no OpenAI spend - FAIL OPEN)
  session_read: "open",
  session_write: "open",

  // Vella text session (tokens + OpenAI - FAIL CLOSED)
  vella_text: "closed",

  // Inbox/proposals (user data - FAIL OPEN)
  inbox_read: "open",
  inbox_proposals: "open",

  // Identity/forecast (read-only insights - FAIL OPEN)
  identity_read: "open",
  forecast_read: "open",

  // Weekly review (may use OpenAI but has fallback - FAIL CLOSED)
  weekly_review: "closed",

  // Check-in contracts (user data - FAIL OPEN)
  checkin_contracts: "open",
  session_confirm_contract: "open",

  // Commitments (user data - FAIL OPEN)
  commitments_create: "open",
  commitments_list: "open",
  commitments_outcome: "open",
  commitments_status: "open",

  // Token balance read (read-only - FAIL OPEN)
  token_balance_read: "open",

  // Entitlements read (read-only - FAIL OPEN)
  entitlements_read: "open",

  // Account/plan read (read-only - FAIL OPEN)
  account_plan_read: "open",

  // Account delete (destructive - FAIL CLOSED)
  account_delete: "closed",

  // Account export (data export - FAIL OPEN)
  account_export: "open",

  // Deep insights (background generation, no real-time OpenAI spend - FAIL OPEN)
  deep_insights: "open",

  // Behaviour loops (read-only insights - FAIL OPEN)
  behaviour_loops: "open",

  // Behavioural state (read-only - FAIL OPEN)
  behavioural_state: "open",

  // Cognitive distortions (read-only insights - FAIL OPEN)
  cognitive_distortions: "open",

  // Clarity/compass (OpenAI spend - FAIL CLOSED)
  clarity: "closed",
  compass: "closed",

  // Deep dive (OpenAI spend - FAIL CLOSED)
  deepdive: "closed",

  // Emotion intel (OpenAI spend - FAIL CLOSED)
  emotion_intel: "closed",

  // Growth roadmap (OpenAI spend - FAIL CLOSED)
  growth_roadmap: "closed",

  // Strategy (OpenAI spend - FAIL CLOSED)
  strategy: "closed",

  // Reflection (OpenAI spend - FAIL CLOSED)
  reflection: "closed",

  // Architect (OpenAI spend - FAIL CLOSED)
  architect: "closed",

  // Memory search (read-only - FAIL OPEN)
  memory_search: "open",

  // Pattern insight (read-only, public, no OpenAI - FAIL OPEN)
  pattern_insight: "open",

  // Connection/identity/insights read (FAIL OPEN)
  connection_depth: "open",
  connection_index: "open",
  identity: "open",
  distortions: "open",
  emotion_memory: "open",
  execution_trigger_log: "open",
  execution_trigger_suppressed: "open",
  feedback_create: "open",
  goals: "open",
  governance_state: "open",
  insights_snapshot: "open",
  journal_themes: "open",
  journal_console: "open",
  journal_preview: "open",
  life_themes: "open",
  loops: "open",
  migration_complete: "open",
  patterns: "open",
  prediction: "open",
  progress: "open",
  regulation_strategies: "open",
  regulation: "open",
  reports_create: "open",
  roadmap: "open",
  state_current: "open",
  state_history: "open",
  state_recompute: "open",
  strengths_values: "open",
  stripe_portal: "open",
  stripe_token_pack: "open",
  themes: "open",
  traits: "open",

  // Service-key protected rebuild/snapshot (FAIL CLOSED)
  service_key_rebuild: "closed",
  service_key_protection: "closed",
  migration_export: "open",
};

/**
 * Default fallback when a route is not in the policy map.
 * This should be used for development only - production routes
 * must have explicit entries in RATE_LIMIT_POLICY.
 *
 * SECURITY: Defaults to "closed" for safety.
 */
export const RATE_LIMIT_DEFAULT_POLICY: RateLimitPolicy = "closed";

/**
 * Get the rate limit policy for a route.
 * Logs warning in development if route is not explicitly configured.
 */
export function getRateLimitPolicy(routeKey: string): RateLimitPolicy {
  const policy = RATE_LIMIT_POLICY[routeKey];
  if (!policy && process.env.NODE_ENV === "development") {
    // Silent in production; warn in dev to encourage explicit configuration
    return RATE_LIMIT_DEFAULT_POLICY;
  }
  return policy ?? RATE_LIMIT_DEFAULT_POLICY;
}

/**
 * Check if a route has an explicit policy configured.
 * Useful for tests and audits.
 */
export function hasExplicitPolicy(routeKey: string): boolean {
  return routeKey in RATE_LIMIT_POLICY;
}

/**
 * All routes with "closed" policy (money-spending or critical).
 * Used for audits and compliance checks.
 */
export const CLOSED_ROUTES = Object.entries(RATE_LIMIT_POLICY)
  .filter(([, policy]) => policy === "closed")
  .map(([key]) => key);

/**
 * All routes with "open" policy (safe to fail-open).
 * Used for audits and compliance checks.
 */
export const OPEN_ROUTES = Object.entries(RATE_LIMIT_POLICY)
  .filter(([, policy]) => policy === "open")
  .map(([key]) => key);
