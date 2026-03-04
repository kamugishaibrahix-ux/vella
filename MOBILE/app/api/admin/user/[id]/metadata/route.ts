/**
 * GET /api/admin/user/:id/metadata
 * Plan, token usage totals, governance_state (state_json), counts only. No text content.
 * Requires admin role.
 */

import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin/requireAdminRole";
import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, rateLimit429Response } from "@/lib/security/rateLimit";

const RATE_LIMIT_ADMIN_READ = { limit: 60, window: 60 }; // 60 requests per minute

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRole();
  if (auth instanceof NextResponse) return auth;

  // Phase 3.3: Rate limit with explicit policy (FAIL-OPEN - admin read)
  const rateLimitResult = await rateLimit({
    key: `admin_metadata:${auth.userId}`,
    limit: RATE_LIMIT_ADMIN_READ.limit,
    window: RATE_LIMIT_ADMIN_READ.window,
    routeKey: "admin_metadata_write", // Note: This is a read, but uses write bucket for consistency
  });
  if (!rateLimitResult.allowed && rateLimitResult.status === 429) {
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }
  // Note: 503 (Redis down with FAIL-OPEN) is allowed to proceed with fallback throttle

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server not configured", code: "SERVER_ERROR" },
      { status: 503 }
    );
  }

  const { id: userId } = await params;
  if (!userId) {
    return NextResponse.json(
      { error: "Missing user id", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    const [subRes, usageRes, govRes, convRes, journalRes] = await Promise.all([
      fromSafe("subscriptions").select("plan, status").eq("user_id", userId).maybeSingle(),
      fromSafe("token_usage").select("tokens").eq("user_id", userId),
      fromSafe("governance_state").select("state_json").eq("user_id", userId).maybeSingle(),
      fromSafe("conversation_metadata_v2").select("id").eq("user_id", userId),
      fromSafe("journal_entries_v2").select("id").eq("user_id", userId),
    ]);

    const sub = subRes.data as { plan: string | null; status: string | null } | null;
    const usageRows = (usageRes.data ?? []) as Array<{ tokens: number }>;
    const totalTokens = usageRows.reduce((sum, r) => sum + (r.tokens ?? 0), 0);
    const gov = govRes.data as { state_json: Record<string, unknown> | null } | null;
    const convCount = Array.isArray(convRes.data) ? convRes.data.length : 0;
    const journalCount = Array.isArray(journalRes.data) ? journalRes.data.length : 0;

    return NextResponse.json({
      plan: sub?.plan ?? null,
      subscription_status: sub?.status ?? null,
      token_usage_total: totalTokens,
      governance_state: gov?.state_json ?? null,
      conversation_count: convCount,
      journal_count: journalCount,
    }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: "server_error", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
