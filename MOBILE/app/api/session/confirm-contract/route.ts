/**
 * POST /api/session/confirm-contract
 * Creates a contract ONLY after explicit user confirmation of a session proposal.
 * Reuses checkin POST validation: domain alignment, dedup, enforcement mode, weekly cap.
 * Origin always "system" — session-originated contracts.
 * No free text. No origin override. Fail closed on any error.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveUser, isActiveUserBlocked } from "@/lib/auth/requireActiveUser";
import { fromSafe } from "@/lib/supabase/admin";
import { countWeeklyContracts, createContract } from "@/lib/contracts/contractStoreServer";
import { getUserPlanTier } from "@/lib/tiers/server";
import { isValidPlanTier, UnknownTierError } from "@/lib/plans/defaultEntitlements";
import type { PlanTier } from "@/lib/plans/types";

// ---------------------------------------------------------------------------
// Constants
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

const TIER_CONTRACT_CAP: Record<PlanTier, number> = {
  free: 1,
  pro: 3,
  elite: 5,
};

const DEDUP_WINDOW_MS = 72 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Body Schema — Strict, no free-text
// ---------------------------------------------------------------------------

const ConfirmBodySchema = z.object({
  domain: z.enum(VALID_DOMAINS),
  severity: z.enum(VALID_SEVERITIES),
  duration_days: z.number().int().min(3).max(30),
  budget_weight: z.number().int().min(1).max(5),
}).strict();

// ---------------------------------------------------------------------------
// POST Handler
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
      { status: 400 },
    );
  }

  const bodyResult = ConfirmBodySchema.safeParse(rawBody);
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
      { status: 400 },
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
        { status: 500 },
      );
    }
    throw err;
  }

  if (!isValidPlanTier(planTier)) {
    return NextResponse.json(
      { error: "plan_resolution_failed", code: "PLAN_RESOLUTION_FAILED" },
      { status: 500 },
    );
  }

  // Step 4: Parallel fetch — weekly count, selected domains, system status, dedup
  const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  const [
    weeklyResult,
    prefsResult,
    systemResult,
    dedupResult,
  ] = await Promise.all([
    countWeeklyContracts(userId),

    fromSafe("user_preferences")
      .select("selected_focus_domains")
      .eq("user_id", userId)
      .maybeSingle(),

    fromSafe("system_status_current")
      .select("enforcement_mode")
      .eq("user_id", userId)
      .maybeSingle(),

    fromSafe("contracts_current")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("domain", body.domain)
      .eq("severity", body.severity)
      .gte("created_at", dedupCutoff),
  ]);

  // Step 4a: Domain alignment
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
      { status: 409 },
    );
  }

  // Step 4b: Deduplication
  const dedupContracts = (dedupResult.data ?? []) as { id: string }[];
  if (dedupContracts.length > 0) {
    return NextResponse.json(
      {
        error: "duplicate_contract",
        code: "DUPLICATE_CONTRACT",
        existing_id: dedupContracts[0].id,
      },
      { status: 409 },
    );
  }

  // Step 4c: Enforcement mode awareness
  const enforcementMode: string | null =
    systemResult.data
      ? ((systemResult.data as Record<string, unknown>).enforcement_mode as string)
      : null;

  if (enforcementMode === "observe") {
    return NextResponse.json(
      { error: "observe_mode_block", code: "OBSERVE_MODE_BLOCK" },
      { status: 409 },
    );
  }

  if (enforcementMode === "strict" && body.duration_days > 7) {
    return NextResponse.json(
      {
        error: "strict_mode_duration_exceeded",
        code: "STRICT_MODE_DURATION_EXCEEDED",
        max_duration_days: 7,
      },
      { status: 409 },
    );
  }

  // Step 4d: Weekly cap
  const weeklyUsed = weeklyResult.error ? 0 : weeklyResult.count;
  const weeklyCap = TIER_CONTRACT_CAP[planTier];

  if (weeklyUsed >= weeklyCap) {
    return NextResponse.json(
      {
        error: "weekly_cap_reached",
        code: "WEEKLY_CAP_REACHED",
        weekly: { used: weeklyUsed, cap: weeklyCap, remaining: 0 },
      },
      { status: 409 },
    );
  }

  // Step 5: Insert contract — origin forced to "system" (session-originated)
  const expiresAt = new Date(
    Date.now() + body.duration_days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const insertResult = await createContract({
    user_id: userId,
    template_id: `session-confirmed-${body.domain}-${body.severity}`,
    domain: body.domain,
    origin: "system",
    enforcement_mode: (enforcementMode as "soft" | "strict") ?? "soft",
    severity: body.severity,
    duration_days: body.duration_days,
    budget_weight: body.budget_weight,
    expires_at: expiresAt,
  });

  if (insertResult.error) {
    return NextResponse.json(
      { error: "insert_failed", code: "INSERT_FAILED" },
      { status: 500 },
    );
  }

  const row = insertResult.data!;

  return NextResponse.json(
    {
      ok: true,
      contractId: row.id,
      createdAt: row.created_at,
    },
    { status: 201 },
  );
}
