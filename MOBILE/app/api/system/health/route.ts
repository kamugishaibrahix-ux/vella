import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response } from "@/lib/security/rateLimit";
import { fromSafe } from "@/lib/supabase/admin";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";
import type { Database } from "@/lib/supabase/types";
import { incrementHealthQueryCount } from "./healthInstrumentation";

type MasterStateRow = Database["public"]["Tables"]["master_state_current"]["Row"];
type SystemStatusRow = Database["public"]["Tables"]["system_status_current"]["Row"];

const READ_LIMIT = { limit: 60, window: 60 };
const IP_HEALTH_LIMIT = { limit: 30, window: 60 }; // 30 requests per minute per IP

const CACHE_TTL_MS = 15000; // 15 seconds
const CACHE_KEY_PREFIX = "system_health_v1";

// In-memory cache with TTL - per instance (acceptable for health checks)
interface CacheEntry {
  data: SystemHealthResponse;
  computedAt: number;
  queryCount: number; // For instrumentation
}
const healthCache = new Map<string, CacheEntry>();

interface DomainStress {
  health: number;
  financial: number;
  cognitive: number;
  behavioural: number;
  governance: number;
}

interface SystemHealthResponse {
  globalStabilityScore: number;
  dominantRiskDomain: string;
  focusCapacity: number;
  decisionCapacity: number;
  recoveryRequired: boolean;
  domainStress: DomainStress;
  phase: string;
}

const DEFAULT_DOMAIN_STRESS: DomainStress = {
  health: 0,
  financial: 0,
  cognitive: 0,
  behavioural: 0,
  governance: 0,
};

const DEFAULT_RESPONSE: SystemHealthResponse = {
  globalStabilityScore: 0,
  dominantRiskDomain: "none",
  focusCapacity: 0,
  decisionCapacity: 0,
  recoveryRequired: false,
  domainStress: DEFAULT_DOMAIN_STRESS,
  phase: "stable",
};

/**
 * GET /api/system/health
 * Returns the authenticated user's stability data from master_state_current
 * and system_status_current tables.
 * CACHED: 15 second TTL to prevent DB hammering under load.
 */
export async function GET(request: Request) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  // IP-based rate limiting (prevent abuse from anonymous sources)
  // Phase 3.3: FAIL-OPEN policy - allows fallback throttle when Redis down
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  const ipRateResult = await rateLimit({
    key: `health:ip:${ip}`,
    limit: IP_HEALTH_LIMIT.limit,
    window: IP_HEALTH_LIMIT.window,
    routeKey: "system_health",
  });
  if (!ipRateResult.allowed && ipRateResult.status === 429) {
    return rateLimit429Response(ipRateResult.retryAfterSeconds);
  }
  // Note: 503 (Redis down with FAIL-OPEN) is allowed to proceed with fallback throttle

  // User-based rate limiting (existing)
  const userRateResult = await rateLimit({
    key: `read:system_health:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: "system_health",
  });
  if (!userRateResult.allowed && userRateResult.status === 429) {
    return rateLimit429Response(userRateResult.retryAfterSeconds);
  }
  // Note: 503 (Redis down with FAIL-OPEN) is allowed to proceed with fallback throttle

  // Check cache first
  const cacheKey = `${CACHE_KEY_PREFIX}:${userId}`;
  const cached = healthCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.computedAt < CACHE_TTL_MS) {
    // Return cached response with header indicating cache hit
    const response = NextResponse.json(cached.data);
    response.headers.set("x-health-cache", "hit");
    response.headers.set("x-health-cache-age", String(now - cached.computedAt));
    return response;
  }

  try {
    // Fetch all data in parallel - 7 queries total
    const [
      masterResult,
      statusResult,
      healthRes,
      financialRes,
      cognitiveRes,
      behaviouralRes,
      governanceRes,
    ] = await Promise.all([
      fromSafe("master_state_current")
        .select("global_stability_score, dominant_risk_domain, energy_budget_flag, overload_flag")
        .eq("user_id", userId)
        .maybeSingle() as unknown as Promise<{ data: MasterStateRow | null; error: Error | null }>,
      fromSafe("system_status_current")
        .select("system_phase, top_priority_domain, enforcement_mode, confidence_score")
        .eq("user_id", userId)
        .maybeSingle() as unknown as Promise<{ data: SystemStatusRow | null; error: Error | null }>,
      fromSafe("health_state_current")
        .select("sleep_debt_score, recovery_index, energy_index, volatility_flag")
        .eq("user_id", userId)
        .maybeSingle(),
      fromSafe("financial_state_current")
        .select("financial_stress_index")
        .eq("user_id", userId)
        .maybeSingle(),
      fromSafe("cognitive_state_current")
        .select("regret_index, decision_volatility, bias_frequency_score, avg_confidence")
        .eq("user_id", userId)
        .maybeSingle(),
      // behavioural_state_current may not exist in DB (PGRST205) — wrap safely
      Promise.resolve(
        fromSafe("behavioural_state_current")
          .select("state_json")
          .eq("user_id", userId)
          .maybeSingle()
      ).then(r => r.error ? { data: null, error: null } : r)
       .catch(() => ({ data: null, error: null })) as any,
      fromSafe("governance_state")
        .select("state_json")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    // Increment query counter for instrumentation (7 queries executed)
    incrementHealthQueryCount(7);

    // Handle errors
    if (masterResult.error) {
      console.warn("[API_GATE]", {
        endpoint: "/api/system/health",
        gate: "HEALTH-01",
        status: 500,
        code: "MASTER_STATE_SELECT_ERROR",
        reason: `master_state_current select failed: ${masterResult.error.message}`,
      });
      console.error("[api/system/health] master_state select error:", { message: masterResult.error.message, code: (masterResult.error as any).code, details: (masterResult.error as any).details, hint: (masterResult.error as any).hint });
      return serverErrorResponse(`master_state_current query failed: ${masterResult.error.message}`);
    }
    if (statusResult.error) {
      console.warn("[API_GATE]", {
        endpoint: "/api/system/health",
        gate: "HEALTH-02",
        status: 500,
        code: "SYSTEM_STATUS_SELECT_ERROR",
        reason: `system_status_current select failed: ${statusResult.error.message}`,
      });
      console.error("[api/system/health] system_status select error:", { message: statusResult.error.message, code: (statusResult.error as any).code, details: (statusResult.error as any).details, hint: (statusResult.error as any).hint });
      return serverErrorResponse(`system_status_current query failed: ${statusResult.error.message}`);
    }

    // Calculate domain stress values
    const domainStress = calculateDomainStress({
      health: healthRes.data,
      financial: financialRes.data,
      cognitive: cognitiveRes.data,
      behavioural: behaviouralRes.data,
      governance: governanceRes.data,
    });

    const responseData: SystemHealthResponse = {
      globalStabilityScore: masterResult.data?.global_stability_score ?? 0,
      dominantRiskDomain: masterResult.data?.dominant_risk_domain ?? "none",
      focusCapacity: (statusResult.data as any)?.focus_capacity ?? 0,
      decisionCapacity: (statusResult.data as any)?.decision_capacity ?? 0,
      recoveryRequired: (statusResult.data as any)?.recovery_required ?? false,
      domainStress,
      phase: statusResult.data?.system_phase ?? "stable",
    };

    // Store in cache
    healthCache.set(cacheKey, {
      data: responseData,
      computedAt: now,
      queryCount: 7,
    });

    // Return response with cache miss header
    const response = NextResponse.json(responseData);
    response.headers.set("x-health-cache", "miss");
    return response;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : typeof error === "object" && error !== null ? JSON.stringify({ message: (error as any).message, code: (error as any).code, details: (error as any).details, hint: (error as any).hint }) : String(error);
    console.error("[api/system/health] catch-all error:", errMsg);
    safeErrorLog("[api/system/health] error", error);
    return serverErrorResponse(errMsg);
  }
}

// Helper to compute domain stress values
function calculateDomainStress(data: {
  health: Record<string, unknown> | null;
  financial: Record<string, unknown> | null;
  cognitive: Record<string, unknown> | null;
  behavioural: Record<string, unknown> | null;
  governance: Record<string, unknown> | null;
}): DomainStress {
  const health = data.health;
  const financial = data.financial;
  const cognitive = data.cognitive;
  const behavioural = data.behavioural;
  const governance = data.governance;

  // Health stress calculation
  const healthStress = health
    ? Math.round(
        ((health.sleep_debt_score as number) ?? 0) * 0.4 +
          (100 - ((health.recovery_index as number) ?? 0)) * 0.3 +
          (100 - ((health.energy_index as number) ?? 0)) * 0.2 +
          (health.volatility_flag ? 10 : 0),
      )
    : 0;

  // Financial stress
  const financialStress = (financial?.financial_stress_index as number) ?? 0;

  // Cognitive stress
  const cognitiveStress = cognitive
    ? Math.round(
        ((cognitive.regret_index as number) ?? 0) * 0.35 +
          ((cognitive.decision_volatility as number) ?? 0) * 0.3 +
          ((cognitive.bias_frequency_score as number) ?? 0) * 0.25 +
          (10 - ((cognitive.avg_confidence as number) ?? 0)) / 10 * 10,
      )
    : 0;

  // Behavioural stress
  const stateJson = behavioural?.state_json as Record<string, unknown> | undefined;
  const connectionDepth = (stateJson?.connection_depth as number) ?? 5;
  const behaviouralStress = Math.round(Math.max(0, (10 - connectionDepth) * 10));

  // Governance stress
  const govStateJson = governance?.state_json as Record<string, unknown> | undefined;
  const govRiskScore = (govStateJson?.governance_risk_score as number) ?? 0;
  const governanceStress = Math.round((govRiskScore / 10) * 100);

  return {
    health: Math.min(100, Math.max(0, healthStress)),
    financial: Math.min(100, Math.max(0, financialStress)),
    cognitive: Math.min(100, Math.max(0, cognitiveStress)),
    behavioural: Math.min(100, Math.max(0, behaviouralStress)),
    governance: Math.min(100, Math.max(0, governanceStress)),
  };
}
