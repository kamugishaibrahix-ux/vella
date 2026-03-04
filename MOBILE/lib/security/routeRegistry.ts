/**
 * Route Registry - Single Source of Truth for API Governance
 *
 * Phase 4.5: Money-spend invariant enforcement.
 * Every endpoint that spends money MUST follow:
 * 1. Entitlement gate exists
 * 2. Rate limit is enforced and respects fail-closed policy
 * 3. Charge happens BEFORE any OpenAI spend
 * 4. All post-charge failure paths refund (idempotent via requestId)
 *
 * Rules:
 * - risk="money_spend" => entitlement REQUIRED + rateLimitPolicy MUST be "closed" + tokenCategory REQUIRED
 * - risk="admin_write" => entitlement REQUIRED + rateLimitPolicy MUST be "closed"
 * - risk="safe_read" => entitlement optional, rateLimitPolicy typically "open"
 * - risk="ledger_write" => direct table writes blocked at DB level (firewall)
 *
 * CI/CD: verify-governance-gates.mjs enforces:
 * - Registry completeness (all money routes registered)
 * - routeKey presence in rateLimit() calls
 * - Entitlement checks present
 * - Rate limit policy consistency
 * - Ledger write firewall
 * - Charge-before-spend order
 * - Refund-on-failure paths
 * - Rate limit result enforcement (fail-closed)
 */

export type RouteRisk = "money_spend" | "ledger_write" | "safe_read" | "admin_write";

export interface RouteSpec {
  /** Full API route path (e.g., "/api/transcribe") */
  routePath: string;

  /** Short identifier used in rateLimit() calls and policy maps */
  routeKey: string;

  /** Risk classification determines required guards */
  risk: RouteRisk;

  /** Feature entitlement key (required for money_spend and admin_write) */
  entitlement?: string;

  /** Rate limit policy: "closed" = fail-closed (Redis down = deny), "open" = fail-open */
  rateLimitPolicy: "open" | "closed";

  /** Token category for billing (required for money_spend) */
  tokenCategory?: "text" | "audio" | "realtime_voice";

  /** Brief description of route purpose */
  description: string;

  // ============================================================
  // Phase 4.5: Money-spend invariant fields
  // ============================================================

  /**
   * Patterns that indicate money is being spent (OpenAI API calls).
   * Required for money_spend routes. At least one must match.
   * Examples: ".chat.completions.create", "client.audio.speech"
   */
  openaiSignals?: string[];

  /**
   * Additional patterns that indicate this route spends tokens.
   * Optional - chargeTokensForOperation is the primary signal.
   */
  spendSignals?: string[];

  /** Function call that charges tokens (default: chargeTokensForOperation) */
  chargeCall?: string;

  /** Function call that refunds tokens (default: refundTokensForOperation) */
  refundCall?: string;
}

/**
 * Master registry of all sensitive API routes.
 *
 * CRITICAL: All AI-spending routes must have:
 * 1. requireEntitlement() call matching `entitlement` field
 * 2. rateLimit() call with routeKey matching `routeKey` field
 * 3. chargeTokensForOperation() before OpenAI call (for money_spend)
 * 4. refundTokensForOperation() in all failure paths after charge (for money_spend)
 * 5. Rate limit result checked with `if (!rateLimitResult.allowed)` guard
 * 6. For closed policy: 503 check and fail-closed response
 *
 * Admin routes must have:
 * 1. requireAdminRole() or equivalent
 * 2. rateLimitPolicy = "closed"
 */
export const ROUTE_REGISTRY: RouteSpec[] = [
  // ============================================================
  // AI SPENDING ROUTES (money_spend) - All FAIL-CLOSED
  // ============================================================

  {
    routePath: "/api/transcribe",
    routeKey: "transcribe",
    risk: "money_spend",
    entitlement: "transcribe",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Whisper transcription - charges tokens before OpenAI call",
    openaiSignals: ["transcriptions.create"],
    spendSignals: ["audio"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/clarity",
    routeKey: "clarity",
    risk: "money_spend",
    entitlement: "clarity",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Clarity AI agent - charges tokens before OpenAI call",
    openaiSignals: [".chat.completions.create"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/strategy",
    routeKey: "strategy",
    risk: "money_spend",
    entitlement: "strategy",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Strategy AI agent - charges tokens before OpenAI call",
    openaiSignals: [".chat.completions.create"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/compass",
    routeKey: "compass",
    risk: "money_spend",
    entitlement: "compass",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Compass AI agent - charges tokens before OpenAI call",
    openaiSignals: [".chat.completions.create"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/deepdive",
    routeKey: "deepdive",
    risk: "money_spend",
    entitlement: "deepdive",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Deep dive AI analysis - charges tokens before OpenAI call",
    openaiSignals: [".chat.completions.create"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/reflection",
    routeKey: "reflection",
    risk: "money_spend",
    entitlement: "reflection",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Reflection AI analysis - charges tokens before OpenAI call",
    openaiSignals: ["callVellaReflectionAPI"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/architect",
    routeKey: "architect",
    risk: "money_spend",
    entitlement: "architect",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Life architect AI - charges tokens before OpenAI call",
    openaiSignals: [".chat.completions.create"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/growth-roadmap",
    routeKey: "growth_roadmap",
    risk: "money_spend",
    entitlement: "growth_roadmap",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Growth roadmap AI - charges tokens before OpenAI call",
    openaiSignals: [".chat.completions.create"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/emotion-intel",
    routeKey: "emotion_intel",
    risk: "money_spend",
    entitlement: "emotion_intel",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Emotional intelligence AI - charges tokens before OpenAI call",
    openaiSignals: [".chat.completions.create"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/deep-insights",
    routeKey: "deep_insights",
    risk: "safe_read",
    entitlement: "deep_insights",
    rateLimitPolicy: "open",
    description: "Deep insights read/background generation - no real-time OpenAI spend",
  },
  {
    routePath: "/api/insights/generate",
    routeKey: "insights_generate",
    risk: "money_spend",
    entitlement: "insights_generate",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Insights generation AI - charges tokens before OpenAI call",
    openaiSignals: [".chat.completions.create"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/insights/patterns",
    routeKey: "insights_patterns",
    risk: "money_spend",
    entitlement: "insights_patterns",
    rateLimitPolicy: "closed",
    tokenCategory: "text",
    description: "Pattern analysis AI - charges tokens before OpenAI call",
    openaiSignals: [".chat.completions.create"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/audio/vella",
    routeKey: "audio_vella",
    risk: "money_spend",
    entitlement: "audio_vella",
    rateLimitPolicy: "closed",
    tokenCategory: "audio",
    description: "Audio generation via OpenAI - charges tokens before API call",
    openaiSignals: ["/v1/audio/speech", "client.audio", "OPENAI_ENDPOINT"],
    spendSignals: ["audio"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  {
    routePath: "/api/realtime/offer",
    routeKey: "realtime_offer",
    risk: "money_spend",
    entitlement: "realtime_offer",
    rateLimitPolicy: "closed",
    tokenCategory: "realtime_voice",
    description: "Realtime offer negotiation - charges tokens",
    openaiSignals: [".chat.completions.create"],
    chargeCall: "chargeTokensForOperation",
    refundCall: "refundTokensForOperation",
  },
  // realtime/token removed — dead route (no callers; client uses realtime/offer only)

  // ============================================================
  // ADMIN WRITE ROUTES (admin_write) - All FAIL-CLOSED
  // ============================================================

  {
    routePath: "/api/admin/user/[id]/suspend",
    routeKey: "admin_suspend",
    risk: "admin_write",
    entitlement: "admin_suspend",
    rateLimitPolicy: "closed",
    description: "Admin user suspension - privileged operation",
  },
  {
    routePath: "/api/admin/user/[id]/metadata",
    routeKey: "admin_metadata_write",
    risk: "admin_write",
    entitlement: "admin_write",
    rateLimitPolicy: "closed",
    description: "Admin user metadata write - privileged operation",
  },

  // ============================================================
  // STRIPE/PAYMENT ROUTES (ledger_write via SECURITY DEFINER) - All FAIL-CLOSED
  // ============================================================

  {
    routePath: "/api/stripe/webhook",
    routeKey: "stripe_webhook",
    risk: "ledger_write",
    rateLimitPolicy: "closed",
    description: "Stripe webhook - token topups via atomic_stripe_webhook_process()",
  },

  // ============================================================
  // SAFE READ ROUTES (safe_read) - Typically FAIL-OPEN
  // ============================================================

  {
    routePath: "/api/system/health",
    routeKey: "system_health",
    risk: "safe_read",
    rateLimitPolicy: "open",
    description: "System health check - monitoring endpoint",
  },
  {
    routePath: "/api/account/plan",
    routeKey: "account_plan_read",
    risk: "safe_read",
    rateLimitPolicy: "open",
    description: "Read user plan and entitlements",
  },
  {
    routePath: "/api/account/token-balance",
    routeKey: "token_balance_read",
    risk: "safe_read",
    rateLimitPolicy: "open",
    description: "Read token balance",
  },
  {
    routePath: "/api/account/entitlements",
    routeKey: "entitlements_read",
    risk: "safe_read",
    rateLimitPolicy: "open",
    description: "Read feature entitlements",
  },
  {
    routePath: "/api/journal",
    routeKey: "journal_read",
    risk: "safe_read",
    rateLimitPolicy: "open",
    description: "Journal read operations",
  },
  {
    routePath: "/api/check-ins",
    routeKey: "checkin_read",
    risk: "safe_read",
    rateLimitPolicy: "open",
    description: "Check-in read operations",
  },
  {
    routePath: "/api/memory/search",
    routeKey: "memory_search",
    risk: "safe_read",
    rateLimitPolicy: "open",
    description: "Memory search via chat_text entitlement",
  },
  {
    routePath: "/api/vella/text",
    routeKey: "vella_text",
    risk: "safe_read",
    rateLimitPolicy: "open",
    description: "Vella text session - no audio cost",
  },
];

/**
 * Get route spec by route path.
 * Returns undefined if route is not in registry (should trigger CI failure).
 */
export function getRouteSpec(routePath: string): RouteSpec | undefined {
  return ROUTE_REGISTRY.find((r) => r.routePath === routePath);
}

/**
 * Get route spec by route key.
 */
export function getRouteSpecByKey(routeKey: string): RouteSpec | undefined {
  return ROUTE_REGISTRY.find((r) => r.routeKey === routeKey);
}

/**
 * All money-spending routes (for audit and compliance).
 */
export const MONEY_SPEND_ROUTES = ROUTE_REGISTRY.filter((r) => r.risk === "money_spend");

/**
 * All admin routes (for audit and compliance).
 */
export const ADMIN_ROUTES = ROUTE_REGISTRY.filter((r) => r.risk === "admin_write");

/**
 * All ledger-touching routes (for audit and compliance).
 */
export const LEDGER_ROUTES = ROUTE_REGISTRY.filter(
  (r) => r.risk === "ledger_write" || r.risk === "money_spend"
);

/**
 * All fail-closed routes (money spend + admin + stripe).
 */
export const CLOSED_POLICY_ROUTES = ROUTE_REGISTRY.filter((r) => r.rateLimitPolicy === "closed");
