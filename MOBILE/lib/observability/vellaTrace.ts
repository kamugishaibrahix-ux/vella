/**
 * Vella Route Trace — structured observability for /api/vella/text
 *
 * Creates a request-scoped trace object that collects routing decisions,
 * token gating inputs, OpenAI call results, and error details.
 *
 * Emitted to:
 *   - Server logs (console.info structured JSON)
 *   - Response header: x-vella-trace-id
 *   - Response JSON __debug (when debug mode enabled)
 *
 * DEBUG enablement:
 *   - process.env.NEXT_PUBLIC_VELLA_DEBUG === "1"
 *   - OR request header "x-vella-debug: 1"
 *   - Never in production by default
 */

export interface VellaTrace {
  trace_id: string;
  ts_start: number;
  user_id: string | null;
  session_type: "anon" | "authed" | null;
  plan: "free" | "pro" | "elite" | null;
  plan_override: string | null;
  entitlements: {
    maxMonthlyTokens: number;
    enableDeepMemory: boolean;
  } | null;
  token_balance_before: number | null;
  token_balance_after: number | null;
  router_decision: {
    mode: "engine" | "ai" | "greeting_template" | null;
    tier: string | null;
    reason: string | null;
    word_count: number | null;
    char_count: number | null;
    rules_triggered: string[];
    is_first_message: boolean;
    greeting_matched: boolean;
    token_blocked: boolean;
  };
  openai_call: {
    attempted: boolean;
    model: string | null;
    duration_ms: number | null;
    success: boolean | null;
    error_message: string | null;
  };
  error: {
    stage: string | null;
    message: string | null;
    code: string | null;
    status: number | null;
  };
  duration_ms: number | null;
  route_path: string | null;
}

export function createTrace(requestId?: string): VellaTrace {
  return {
    trace_id: requestId ?? crypto.randomUUID(),
    ts_start: Date.now(),
    user_id: null,
    session_type: null,
    plan: null,
    plan_override: null,
    entitlements: null,
    token_balance_before: null,
    token_balance_after: null,
    router_decision: {
      mode: null,
      tier: null,
      reason: null,
      word_count: null,
      char_count: null,
      rules_triggered: [],
      is_first_message: false,
      greeting_matched: false,
      token_blocked: false,
    },
    openai_call: {
      attempted: false,
      model: null,
      duration_ms: null,
      success: null,
      error_message: null,
    },
    error: {
      stage: null,
      message: null,
      code: null,
      status: null,
    },
    duration_ms: null,
    route_path: null,
  };
}

/**
 * Check if debug mode is active for this request.
 */
export function isDebugEnabled(req?: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.NEXT_PUBLIC_VELLA_DEBUG === "1") return true;
  if (req) {
    try {
      return req.headers.get("x-vella-debug") === "1";
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Finalize trace: compute duration, emit structured log.
 */
export function finalizeTrace(trace: VellaTrace): void {
  trace.duration_ms = Date.now() - trace.ts_start;

  // Structured server log — never includes secrets
  console.info("[VELLA_TRACE]", JSON.stringify({
    trace_id: trace.trace_id,
    duration_ms: trace.duration_ms,
    user_id: trace.user_id,
    session_type: trace.session_type,
    plan: trace.plan,
    plan_override: trace.plan_override,
    route_path: trace.route_path,
    router: trace.router_decision,
    openai: trace.openai_call,
    tokens: {
      before: trace.token_balance_before,
      after: trace.token_balance_after,
    },
    error: trace.error.stage ? trace.error : undefined,
  }));
}

/**
 * Build the debug summary object for response JSON.
 */
export function buildDebugPayload(trace: VellaTrace): Record<string, unknown> {
  return {
    trace_id: trace.trace_id,
    mode: trace.router_decision.mode,
    tier: trace.router_decision.tier,
    reason: trace.router_decision.reason,
    rules_triggered: trace.router_decision.rules_triggered,
    is_first_message: trace.router_decision.is_first_message,
    greeting_matched: trace.router_decision.greeting_matched,
    token_blocked: trace.router_decision.token_blocked,
    plan: trace.plan,
    plan_override: trace.plan_override,
    token_balance_before: trace.token_balance_before,
    token_balance_after: trace.token_balance_after,
    openai_attempted: trace.openai_call.attempted,
    openai_model: trace.openai_call.model,
    openai_duration_ms: trace.openai_call.duration_ms,
    openai_success: trace.openai_call.success,
    error_stage: trace.error.stage,
    error_message: trace.error.message,
    duration_ms: trace.duration_ms,
    route_path: trace.route_path,
  };
}

/**
 * Attach trace headers to a NextResponse-compatible headers init.
 */
export function traceHeaders(trace: VellaTrace): Record<string, string> {
  return {
    "x-vella-trace-id": trace.trace_id,
  };
}
