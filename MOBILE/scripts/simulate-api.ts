/**
 * API Simulation Harness — dev-only, environment-guarded.
 *
 * Simulates the critical internal call paths of:
 *   POST /api/vella/text
 *   GET  /api/system/health
 *   GET  /api/state/current
 *   GET  /api/commitments/list
 *
 * Does NOT bypass production auth permanently.
 * Guarded by: NODE_ENV=development && VELLA_DEV_BYPASS=1
 *
 * Usage:
 *   VELLA_DEV_BYPASS=1 npx tsx scripts/simulate-api.ts
 */

// ---------------------------------------------------------------------------
// Guard: dev-only
// ---------------------------------------------------------------------------
if (
  process.env.NODE_ENV !== "development" ||
  process.env.VELLA_DEV_BYPASS !== "1"
) {
  console.error(
    "BLOCKED: simulation harness requires NODE_ENV=development and VELLA_DEV_BYPASS=1"
  );
  process.exit(1);
}

const FIXED_USER_ID = "00000000-0000-0000-0000-000000000000";

interface SimResult {
  endpoint: string;
  status: number;
  gateCode: string | null;
  reason: string | null;
  data?: unknown;
}

const results: SimResult[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function importSafe<T>(path: string): Promise<T | null> {
  try {
    return await import(path);
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Simulate GET /api/system/health (internal path)
// ---------------------------------------------------------------------------
async function simSystemHealth(): Promise<SimResult> {
  const endpoint = "/api/system/health";
  try {
    const { fromSafe } = await import("@/lib/supabase/admin");

    // master_state_current
    const masterResult = await fromSafe("master_state_current")
      .select(
        "global_stability_score, dominant_risk_domain, energy_budget_flag, overload_flag"
      )
      .eq("user_id", FIXED_USER_ID)
      .maybeSingle();

    if (masterResult.error) {
      return {
        endpoint,
        status: 500,
        gateCode: "HEALTH-01",
        reason: `master_state_current select failed: ${masterResult.error.message}`,
      };
    }

    // system_status_current
    const statusResult = await fromSafe("system_status_current")
      .select(
        "system_phase, focus_capacity, decision_capacity, recovery_required"
      )
      .eq("user_id", FIXED_USER_ID)
      .maybeSingle();

    if (statusResult.error) {
      return {
        endpoint,
        status: 500,
        gateCode: "HEALTH-02",
        reason: `system_status_current select failed: ${statusResult.error.message}`,
      };
    }

    return {
      endpoint,
      status: 200,
      gateCode: null,
      reason: null,
      data: { master: masterResult.data, status: statusResult.data },
    };
  } catch (e) {
    return {
      endpoint,
      status: 500,
      gateCode: "HEALTH-ERR",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Simulate GET /api/state/current (internal path)
// ---------------------------------------------------------------------------
async function simStateCurrent(): Promise<SimResult> {
  const endpoint = "/api/state/current";
  try {
    const { fromSafe } = await import("@/lib/supabase/admin");

    const { data, error } = await fromSafe("behavioural_state_current")
      .select("version, state_json, last_computed_at, updated_at")
      .eq("user_id", FIXED_USER_ID)
      .maybeSingle();

    if (error) {
      return {
        endpoint,
        status: 500,
        gateCode: "STATE-01",
        reason: `behavioural_state_current select failed: ${error.message}`,
      };
    }

    return {
      endpoint,
      status: 200,
      gateCode: null,
      reason: null,
      data: data ?? { version: 0, state: "empty" },
    };
  } catch (e) {
    return {
      endpoint,
      status: 500,
      gateCode: "STATE-ERR",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Simulate GET /api/commitments/list (internal path)
// ---------------------------------------------------------------------------
async function simCommitmentsList(): Promise<SimResult> {
  const endpoint = "/api/commitments/list";
  try {
    const { listCommitments } = await import(
      "@/lib/execution/commitmentStore"
    );

    const result = await listCommitments(FIXED_USER_ID);

    if (result.error) {
      return {
        endpoint,
        status: 500,
        gateCode: "COMMIT-01",
        reason: `commitments query failed: ${result.error}`,
      };
    }

    return {
      endpoint,
      status: 200,
      gateCode: null,
      reason: null,
      data: { count: result.commitments.length },
    };
  } catch (e) {
    return {
      endpoint,
      status: 500,
      gateCode: "COMMIT-ERR",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Simulate POST /api/vella/text (entitlement + token pre-check path)
// ---------------------------------------------------------------------------
async function simVellaText(): Promise<SimResult> {
  const endpoint = "/api/vella/text";
  try {
    const { resolvePlanEntitlements } = await import(
      "@/lib/plans/resolvePlanEntitlements"
    );
    const { isFeatureEnabled } = await import("@/lib/plans/featureRegistry");
    const { checkTokenAvailability } = await import(
      "@/lib/tokens/enforceTokenLimits"
    );

    // Step 1: Resolve entitlements for free tier
    const entitlementResult = await resolvePlanEntitlements("free");
    console.log("[sim] entitlement source:", entitlementResult.source);
    console.log(
      "[sim] entitlement keys:",
      Object.keys(entitlementResult.entitlements)
    );

    // Step 2: Feature check (chat_text)
    const allowed = isFeatureEnabled("chat_text", entitlementResult.entitlements);
    if (!allowed) {
      return {
        endpoint,
        status: 403,
        gateCode: "VTXT-01",
        reason: "chat_text feature not enabled for plan",
      };
    }

    // Step 3: Token availability
    const tokenCheck = await checkTokenAvailability(
      FIXED_USER_ID,
      "free",
      1000,
      "vella_text",
      "text"
    );

    if (!tokenCheck.allowed) {
      return {
        endpoint,
        status: 402,
        gateCode: "VTXT-02",
        reason: `Insufficient tokens. remaining=${tokenCheck.remaining}, mode=${tokenCheck.mode}`,
      };
    }

    return {
      endpoint,
      status: 200,
      gateCode: null,
      reason: null,
      data: {
        entitlementSource: entitlementResult.source,
        tokenRemaining: tokenCheck.remaining,
      },
    };
  } catch (e) {
    return {
      endpoint,
      status: 500,
      gateCode: "VTXT-ERR",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== Vella API Simulation Harness ===");
  console.log(`User ID (fixed): ${FIXED_USER_ID}`);
  console.log("");

  const sims = [
    { name: "POST /api/vella/text", fn: simVellaText },
    { name: "GET  /api/system/health", fn: simSystemHealth },
    { name: "GET  /api/state/current", fn: simStateCurrent },
    { name: "GET  /api/commitments/list", fn: simCommitmentsList },
  ];

  for (const sim of sims) {
    console.log(`--- Simulating: ${sim.name} ---`);
    const result = await sim.fn();
    results.push(result);
    console.log(`  Status:  ${result.status}`);
    console.log(`  Gate:    ${result.gateCode ?? "(none)"}`);
    console.log(`  Reason:  ${result.reason ?? "(success)"}`);
    if (result.data) {
      console.log(`  Data:    ${JSON.stringify(result.data)}`);
    }
    console.log("");
  }

  console.log("=== Summary ===");
  console.table(
    results.map((r) => ({
      endpoint: r.endpoint,
      status: r.status,
      gate: r.gateCode ?? "-",
      reason: r.reason ?? "OK",
    }))
  );
}

main().catch((e) => {
  console.error("Simulation harness error:", e);
  process.exit(1);
});
