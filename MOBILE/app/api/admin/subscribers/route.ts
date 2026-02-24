/**
 * GET /api/admin/subscribers
 * Metadata only: user_id (truncated), plan_tier, subscription_status, counts, governance.
 * No content. Requires admin role.
 */

import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin/requireAdminRole";
import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";

const TRUNCATE_LEN = 8;

function truncateUserId(id: string): string {
  if (id.length <= TRUNCATE_LEN) return id;
  return id.slice(0, TRUNCATE_LEN) + "…";
}

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
    const [subsRes, convRes, journalRes, govRes] = await Promise.all([
      fromSafe("subscriptions").select("user_id, plan, status"),
      fromSafe("conversation_metadata_v2").select("user_id"),
      fromSafe("journal_entries_v2").select("user_id"),
      fromSafe("governance_state").select("user_id, state_json"),
    ]);

    const subs = (subsRes.data ?? []) as Array<{ user_id: string; plan: string | null; status: string | null }>;
    const convRows = (convRes.data ?? []) as Array<{ user_id: string }>;
    const journalRows = (journalRes.data ?? []) as Array<{ user_id: string }>;
    const govRows = (govRes.data ?? []) as Array<{ user_id: string; state_json: Record<string, unknown> | null }>;

    const convCountByUser: Record<string, number> = {};
    for (const r of convRows) {
      convCountByUser[r.user_id] = (convCountByUser[r.user_id] ?? 0) + 1;
    }
    const journalCountByUser: Record<string, number> = {};
    for (const r of journalRows) {
      journalCountByUser[r.user_id] = (journalCountByUser[r.user_id] ?? 0) + 1;
    }
    const govByUser: Record<string, { riskScore: number; escalationLevel: number }> = {};
    for (const r of govRows) {
      const sj = r.state_json;
      govByUser[r.user_id] = {
        riskScore: typeof sj?.governance_risk_score === "number" ? sj.governance_risk_score : 0,
        escalationLevel: typeof sj?.escalation_level === "number" ? sj.escalation_level : 0,
      };
    }

    const subscribers = subs.map((s) => ({
      user_id: truncateUserId(s.user_id),
      plan_tier: s.plan ?? null,
      subscription_status: s.status ?? null,
      total_sessions: convCountByUser[s.user_id] ?? 0,
      total_journals: journalCountByUser[s.user_id] ?? 0,
      governance_risk_score: govByUser[s.user_id]?.riskScore ?? 0,
      escalation_level: govByUser[s.user_id]?.escalationLevel ?? 0,
    }));

    return NextResponse.json({ subscribers }, { status: 200 });
  } catch (err) {
    console.error("[admin/subscribers]", err);
    return NextResponse.json(
      { error: "server_error", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
