/**
 * GET /api/admin/analytics/overview
 * Aggregates only: total users, active subscriptions, plan distribution, avg risk, crisis mode count.
 * No per-user content. Requires admin role.
 */

import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin/requireAdminRole";
import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdminRole();
  if (auth instanceof NextResponse) return auth;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server not configured", code: "SERVER_ERROR" },
      { status: 503 }
    );
  }

  try {
    const [profilesRes, subsRes, govRes, crisisRes] = await Promise.all([
      fromSafe("profiles").select("id"),
      fromSafe("subscriptions").select("plan, status"),
      fromSafe("governance_state").select("state_json"),
      fromSafe("conversation_metadata_v2").select("mode_enum").eq("mode_enum", "crisis"),
    ]);

    const profiles = (profilesRes.data ?? []) as Array<{ id: string }>;
    const subs = (subsRes.data ?? []) as Array<{ plan: string | null; status: string | null }>;
    const govRows = (govRes.data ?? []) as Array<{ state_json: Record<string, unknown> | null }>;
    const crisisRows = crisisRes.data ?? [];

    const total_users = profiles.length;
    const active_subscriptions = subs.filter((s) => s.status === "active").length;
    const plan_distribution: Record<string, number> = {};
    for (const s of subs) {
      const p = s.plan ?? "none";
      plan_distribution[p] = (plan_distribution[p] ?? 0) + 1;
    }
    let riskSum = 0;
    let riskCount = 0;
    for (const r of govRows) {
      const score = r.state_json?.governance_risk_score;
      if (typeof score === "number") {
        riskSum += score;
        riskCount += 1;
      }
    }
    const average_governance_risk_score = riskCount > 0 ? Math.round(riskSum / riskCount) : 0;
    const crisis_mode_count = Array.isArray(crisisRows) ? crisisRows.length : 0;

    return NextResponse.json({
      total_users,
      active_subscriptions,
      plan_distribution,
      average_governance_risk_score,
      crisis_mode_count,
    }, { status: 200 });
  } catch (err) {
    console.error("[admin/analytics/overview]", err);
    return NextResponse.json(
      { error: "server_error", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
