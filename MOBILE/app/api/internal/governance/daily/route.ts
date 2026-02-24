/**
 * Daily Governance Scheduler (idempotent cron).
 * POST /api/internal/governance/daily
 *
 * For each user with a profile: computeGovernanceState(userId).
 * No user content processing. No notifications. No PII in request/response.
 * Protected by GOVERNANCE_DAILY_CRON_SECRET (or CRON_SECRET).
 */

import { NextResponse } from "next/server";
import { fromSafe } from "@/lib/supabase/admin";
import { computeGovernanceState } from "@/lib/governance/stateEngine";

const CRON_SECRET_HEADER = "x-cron-secret";
const CRON_SECRET_ENV = "GOVERNANCE_DAILY_CRON_SECRET";
const CRON_SECRET_FALLBACK_ENV = "CRON_SECRET";

function getCronSecret(): string | null {
  return process.env[CRON_SECRET_ENV] ?? process.env[CRON_SECRET_FALLBACK_ENV] ?? null;
}

function isAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const header = request.headers.get(CRON_SECRET_HEADER) ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return header === secret;
}

async function runDailyGovernance(): Promise<{
  ok: boolean;
  processed: number;
  failed: number;
  total: number;
  error?: string;
}> {
  let userIds: string[] = [];
  try {
    const { data, error } = await fromSafe("profiles").select("id");
    if (error) {
      return { ok: false, processed: 0, failed: 0, total: 0, error: "Failed to list users" };
    }
    userIds = (data ?? []).map((row: { id: string }) => row.id);
  } catch {
    return { ok: false, processed: 0, failed: 0, total: 0, error: "Failed to list users" };
  }

  let processed = 0;
  let failed = 0;
  for (const userId of userIds) {
    const result = await computeGovernanceState(userId);
    if (result.success) processed += 1;
    else failed += 1;
  }

  return { ok: true, processed, failed, total: userIds.length };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDailyGovernance();
  if (!result.ok && result.error) {
    return NextResponse.json(
      { error: result.error, ok: false },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: result.ok,
    processed: result.processed,
    failed: result.failed,
    total: result.total,
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDailyGovernance();
  if (!result.ok && result.error) {
    return NextResponse.json(
      { error: result.error, ok: false },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: result.ok,
    processed: result.processed,
    failed: result.failed,
    total: result.total,
  });
}
