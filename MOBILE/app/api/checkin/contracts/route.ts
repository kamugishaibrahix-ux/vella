/**
 * Check-in Contracts API — GET + POST endpoints for OS-driven check-in page.
 * GET: Returns system status, resource budget, active contracts, and weekly usage.
 * POST: Creates a user contract with server-authoritative cap enforcement.
 * No free-text fields. Strict schema validation via Zod.
 *
 * NAMING STANDARD: "checkin" (no dash/hyphen) used consistently:
 * - Route path: /api/checkin/contracts (no dash)
 * - Rate limit key: checkin_contracts
 * - Related: /api/check-ins (main check-in API, kept for URL backward compatibility)
 * - Internal references: checkin (not check_in, not check-in)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveUser, isActiveUserBlocked } from "@/lib/auth/requireActiveUser";
import { fromSafe } from "@/lib/supabase/admin";
import { countWeeklyContracts, createContract } from "@/lib/contracts/contractStoreServer";
import { getUserPlanTier } from "@/lib/tiers/server";
import { isValidPlanTier, UnknownTierError } from "@/lib/plans/defaultEntitlements";
import type { PlanTier } from "@/lib/plans/types";
import type { Database } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Zod Schemas — Strict validation, no free-text
// ---------------------------------------------------------------------------

const SystemStatusSchema = z.object({
  phase: z.string(),
  top_priority_domain: z.string(),
  urgency_level: z.number().nullable(),
  enforcement_mode: z.string(),
  updated_at: z.string(),
});

const ResourceBudgetSchema = z.object({
  constraint_level: z.string(),
  max_focus_minutes_today: z.number(),
  max_decision_complexity: z.number(),
  spending_tolerance_band: z.number(),
  recovery_required_hours: z.number(),
  confidence_score: z.number(),
  is_stale: z.boolean(),
});

const ContractSchema = z.object({
  id: z.string(),
  template_id: z.string(),
  domain: z.string(),
  origin: z.string(),
  severity: z.string(),
  enforcement_mode: z.string(),
  duration_days: z.number(),
  budget_weight: z.number(),
  created_at: z.string(),
  expires_at: z.string(),
});

const WeeklySchema = z.object({
  used: z.number(),
  cap: z.number(),
  remaining: z.number(),
});

const ResponseSchema = z.object({
  ok: z.literal(true),
  planTier: z.enum(["free", "pro", "elite"]),
  weekly: WeeklySchema,
  system: SystemStatusSchema.nullable(),
  budget: ResourceBudgetSchema.nullable(),
  contracts: z.array(ContractSchema),
  warnings: z.array(z.string()).optional(),
});

type SystemStatusRow = Database["public"]["Tables"]["system_status_current"]["Row"];
type ResourceBudgetRow = Database["public"]["Tables"]["resource_budget_current"]["Row"];
type ContractRow = Database["public"]["Tables"]["contracts_current"]["Row"];

// Tier cap mapping: free=1, pro=3, elite=5
const TIER_CONTRACT_CAP: Record<PlanTier, number> = {
  free: 1,
  pro: 3,
  elite: 5,
};

// ---------------------------------------------------------------------------
// Helper: Check if system status is stale (> 1 hour old)
// ---------------------------------------------------------------------------
function isSystemStale(updatedAt: string): boolean {
  const oneHourMs = 60 * 60 * 1000;
  const updated = new Date(updatedAt).getTime();
  return Date.now() - updated > oneHourMs;
}

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------
export async function GET() {
  // Step 1: Auth — require active user
  const authResult = await requireActiveUser();
  if (isActiveUserBlocked(authResult)) {
    return authResult; // Returns 403 NextResponse
  }
  const { userId } = authResult;

  // Step 2: Resolve plan tier (fail-closed: returns 500 on failure)
  let planTier: PlanTier;
  try {
    planTier = await getUserPlanTier(userId);
  } catch (err) {
    // Check for UnknownTierError by instanceof or name (for mocked tests)
    if (err instanceof UnknownTierError || (err instanceof Error && err.name === "UnknownTierError")) {
      return NextResponse.json(
        { error: "plan_resolution_failed", code: "PLAN_RESOLUTION_FAILED" },
        { status: 500 }
      );
    }
    throw err;
  }

  // Validate the resolved tier
  if (!isValidPlanTier(planTier)) {
    return NextResponse.json(
      { error: "plan_resolution_failed", code: "PLAN_RESOLUTION_FAILED" },
      { status: 500 }
    );
  }

  // Step 3: Fetch data in parallel
  const now = new Date().toISOString();
  const warnings: string[] = [];

  const [
    systemResult,
    budgetResult,
    contractsResult,
    weeklyResult,
  ] = await Promise.all([
    // a) system_status_current
    fromSafe("system_status_current")
      .select("system_phase, top_priority_domain, enforcement_mode, confidence_score, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),

    // b) resource_budget_current
    fromSafe("resource_budget_current")
      .select("constraint_level, max_focus_minutes_today, max_decision_complexity, spending_tolerance_band, recovery_required_hours, confidence_score, is_stale, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),

    // c) contracts_current (active, not expired, ordered by created_at desc)
    fromSafe("contracts_current")
      .select("id, template_id, domain, origin, severity, enforcement_mode, duration_days, budget_weight, created_at, expires_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("expires_at", now)
      .order("created_at", { ascending: false }),

    // d) weekly_count
    countWeeklyContracts(userId),
  ]);

  // Step 4: Process system status
  let system: z.infer<typeof SystemStatusSchema> | null = null;
  if (systemResult.error) {
    warnings.push("MISSING_SYSTEM_STATUS");
  } else if (!systemResult.data) {
    warnings.push("MISSING_SYSTEM_STATUS");
  } else {
    const row = systemResult.data as SystemStatusRow;
    if (isSystemStale(row.updated_at)) {
      warnings.push("STALE_SYSTEM_STATUS");
    }
    system = {
      phase: row.system_phase,
      top_priority_domain: row.top_priority_domain,
      urgency_level: row.confidence_score, // Using confidence_score as urgency proxy
      enforcement_mode: row.enforcement_mode,
      updated_at: row.updated_at,
    };
  }

  // Step 5: Process resource budget
  let budget: z.infer<typeof ResourceBudgetSchema> | null = null;
  if (!budgetResult.error && budgetResult.data) {
    const row = budgetResult.data as ResourceBudgetRow;
    budget = {
      constraint_level: row.constraint_level,
      max_focus_minutes_today: row.max_focus_minutes_today,
      max_decision_complexity: row.max_decision_complexity,
      spending_tolerance_band: row.spending_tolerance_band,
      recovery_required_hours: row.recovery_required_hours,
      confidence_score: row.confidence_score,
      is_stale: row.is_stale,
    };
  }

  // Step 6: Process contracts
  const rawContracts = (contractsResult.data ?? []) as ContractRow[];
  const contracts = rawContracts.map((c) => ({
    id: c.id,
    template_id: c.template_id,
    domain: c.domain,
    origin: c.origin,
    severity: c.severity,
    enforcement_mode: c.enforcement_mode,
    duration_days: c.duration_days,
    budget_weight: c.budget_weight,
    created_at: c.created_at,
    expires_at: c.expires_at,
  }));

  // Step 7: Calculate weekly usage
  const weeklyUsed = weeklyResult.error ? 0 : weeklyResult.count;
  const weeklyCap = TIER_CONTRACT_CAP[planTier];
  const weeklyRemaining = Math.max(0, weeklyCap - weeklyUsed);

  // Step 8: Build and validate response
  const responsePayload = {
    ok: true as const,
    planTier,
    weekly: {
      used: weeklyUsed,
      cap: weeklyCap,
      remaining: weeklyRemaining,
    },
    system,
    budget,
    contracts,
    warnings: warnings.length > 0 ? warnings : undefined,
  };

  // Strict schema validation
  const validation = ResponseSchema.safeParse(responsePayload);
  if (!validation.success) {
    return NextResponse.json(
      { error: "response_validation_failed", code: "RESPONSE_VALIDATION_FAILED" },
      { status: 500 }
    );
  }

  return NextResponse.json(responsePayload);
}

// ---------------------------------------------------------------------------
// POST Body Schema — Strict, no free-text
// ---------------------------------------------------------------------------

const VALID_DOMAINS = [
  "self-mastery",
  "addiction-recovery",
  "emotional-intelligence",
  "relationships",
  "performance-focus",
  "identity-purpose",
  "physical-health",
  "financial-discipline",
] as const;

const VALID_SEVERITIES = ["low", "moderate", "high"] as const;

const PostBodySchema = z.object({
  template_id: z.string().min(1).max(128),
  domain: z.enum(VALID_DOMAINS),
  severity: z.enum(VALID_SEVERITIES),
  duration_days: z.number().int().min(3).max(30),
  budget_weight: z.number().int().min(1).max(5),
}).strict();

// Deduplication window: 72 hours
const DEDUP_WINDOW_MS = 72 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// POST Handler — Create user contract with server-authoritative cap
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // Step 1: Auth
  const authResult = await requireActiveUser();
  if (isActiveUserBlocked(authResult)) {
    return authResult;
  }
  const { userId } = authResult;

  // Step 2: Parse + validate body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const bodyResult = PostBodySchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return NextResponse.json(
      {
        error: "validation_failed",
        code: "VALIDATION_FAILED",
        details: bodyResult.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const body = bodyResult.data;

  // Step 3: Resolve plan tier
  let planTier: PlanTier;
  try {
    planTier = await getUserPlanTier(userId);
  } catch (err) {
    if (err instanceof UnknownTierError || (err instanceof Error && err.name === "UnknownTierError")) {
      return NextResponse.json(
        { error: "plan_resolution_failed", code: "PLAN_RESOLUTION_FAILED" },
        { status: 500 }
      );
    }
    throw err;
  }

  if (!isValidPlanTier(planTier)) {
    return NextResponse.json(
      { error: "plan_resolution_failed", code: "PLAN_RESOLUTION_FAILED" },
      { status: 500 }
    );
  }

  // Step 4: Parallel fetch — weekly count, selected domains, system status, dedup check
  const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  const [
    weeklyResult,
    prefsResult,
    systemResult,
    dedupResult,
  ] = await Promise.all([
    countWeeklyContracts(userId),

    // Selected domains from user_preferences
    fromSafe("user_preferences")
      .select("selected_focus_domains")
      .eq("user_id", userId)
      .maybeSingle(),

    // System status for enforcement mode
    fromSafe("system_status_current")
      .select("enforcement_mode")
      .eq("user_id", userId)
      .maybeSingle(),

    // Deduplication: same domain + severity within 72h
    fromSafe("contracts_current")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("domain", body.domain)
      .eq("severity", body.severity)
      .gte("created_at", dedupCutoff),
  ]);

  // Step 4a: Domain alignment — posted domain must be in user's selected domains
  const selectedDomains: string[] =
    prefsResult.data &&
    Array.isArray((prefsResult.data as Record<string, unknown>).selected_focus_domains)
      ? ((prefsResult.data as Record<string, unknown>).selected_focus_domains as string[])
      : [];

  if (selectedDomains.length > 0 && !selectedDomains.includes(body.domain)) {
    return NextResponse.json(
      {
        error: "domain_not_selected",
        code: "DOMAIN_NOT_SELECTED",
        selected: selectedDomains,
      },
      { status: 409 }
    );
  }

  // Step 4b: Deduplication — reject if active contract with same domain+severity within 72h
  const dedupContracts = (dedupResult.data ?? []) as { id: string }[];
  if (dedupContracts.length > 0) {
    return NextResponse.json(
      {
        error: "duplicate_contract",
        code: "DUPLICATE_CONTRACT",
        existing_id: dedupContracts[0].id,
      },
      { status: 409 }
    );
  }

  // Step 4c: Enforcement mode awareness
  const enforcementMode: string | null =
    systemResult.data
      ? ((systemResult.data as Record<string, unknown>).enforcement_mode as string)
      : null;

  if (enforcementMode === "observe") {
    return NextResponse.json(
      {
        error: "observe_mode_block",
        code: "OBSERVE_MODE_BLOCK",
      },
      { status: 409 }
    );
  }

  if (enforcementMode === "strict" && body.duration_days > 7) {
    return NextResponse.json(
      {
        error: "strict_mode_duration_exceeded",
        code: "STRICT_MODE_DURATION_EXCEEDED",
        max_duration_days: 7,
      },
      { status: 409 }
    );
  }

  // Step 4d: Weekly cap (server-authoritative)
  const weeklyUsed = weeklyResult.error ? 0 : weeklyResult.count;
  const weeklyCap = TIER_CONTRACT_CAP[planTier];

  if (weeklyUsed >= weeklyCap) {
    return NextResponse.json(
      {
        error: "weekly_cap_reached",
        code: "WEEKLY_CAP_REACHED",
        weekly: { used: weeklyUsed, cap: weeklyCap, remaining: 0 },
      },
      { status: 409 }
    );
  }

  // Step 5: Insert contract — origin forced to "user"
  const expiresAt = new Date(
    Date.now() + body.duration_days * 24 * 60 * 60 * 1000
  ).toISOString();

  const insertResult = await createContract({
    user_id: userId,
    template_id: body.template_id,
    domain: body.domain,
    origin: "user",
    enforcement_mode: "soft",
    severity: body.severity,
    duration_days: body.duration_days,
    budget_weight: body.budget_weight,
    expires_at: expiresAt,
  });

  if (insertResult.error) {
    return NextResponse.json(
      { error: "insert_failed", code: "INSERT_FAILED" },
      { status: 500 }
    );
  }

  const row = insertResult.data!;

  // Step 6: Return inserted contract metadata
  return NextResponse.json(
    {
      ok: true,
      contract: {
        id: row.id,
        template_id: row.template_id,
        domain: row.domain,
        origin: row.origin,
        severity: row.severity,
        enforcement_mode: row.enforcement_mode,
        duration_days: row.duration_days,
        budget_weight: row.budget_weight,
        created_at: row.created_at,
        expires_at: row.expires_at,
      },
      weekly: {
        used: weeklyUsed + 1,
        cap: weeklyCap,
        remaining: Math.max(0, weeklyCap - weeklyUsed - 1),
      },
    },
    { status: 201 }
  );
}
