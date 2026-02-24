/**
 * Phase M4 Purge: internal endpoint to run run_phase_m4_purge(p_user_id).
 * POST /api/internal/migration/purge
 *
 * Body: { user_id: string (uuid) }
 * Auth: MIGRATION_PURGE_CRON_SECRET or CRON_SECRET (same pattern as audit).
 * Returns only jsonb counts + request_id. Never logs request/response bodies.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const CRON_SECRET_HEADER = "x-cron-secret";
const CRON_SECRET_ENV = "MIGRATION_PURGE_CRON_SECRET";
const CRON_SECRET_FALLBACK_ENV = "CRON_SECRET";

function getCronSecret(): string | null {
  return process.env[CRON_SECRET_ENV] ?? process.env[CRON_SECRET_FALLBACK_ENV] ?? null;
}

function isAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const header =
    request.headers.get(CRON_SECRET_HEADER) ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return header === secret;
}

type PurgePayload = {
  user_id: string;
  status: string;
  tables: Record<string, { updated_rows: number }>;
  totals: { total_updated_rows: number };
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized", request_id: requestId }, { status: 401 });
  }

  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server not configured", request_id: requestId },
        { status: 503 }
      );
    }

    let body: { user_id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body", request_id: requestId },
        { status: 400 }
      );
    }

    const userId = typeof body?.user_id === "string" ? body.user_id.trim() : null;
    if (!userId) {
      return NextResponse.json(
        { error: "Missing user_id", request_id: requestId },
        { status: 400 }
      );
    }

    const { data, error } = await (supabaseAdmin as unknown as {
      rpc(name: string, params: { p_user_id: string }): Promise<{ data: PurgePayload | null; error: { code?: string; message?: string } | null }>;
    }).rpc("run_phase_m4_purge", { p_user_id: userId });

    if (error) {
      const code = (error as { code?: string }).code;
      const message = (error as { message?: string }).message ?? "";
      if (code === "P0002" || message.includes("MIGRATION_NOT_COMPLETED")) {
        return NextResponse.json(
          { error: "MIGRATION_NOT_COMPLETED", request_id: requestId },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "Purge RPC failed", request_id: requestId },
        { status: 500 }
      );
    }

    if (data == null) {
      return NextResponse.json(
        { error: "Purge RPC returned no data", request_id: requestId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      request_id: requestId,
      user_id: data.user_id,
      status: data.status,
      tables: data.tables ?? {},
      totals: data.totals ?? { total_updated_rows: 0 },
    });
  } catch {
    return NextResponse.json(
      { error: "Purge failed", request_id: requestId },
      { status: 500 }
    );
  }
}
