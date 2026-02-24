/**
 * Phase M1 Migration Audit (metadata only).
 * POST /api/internal/migration/audit
 *
 * Runs run_phase_m1_audit() in DB, writes one row to migration_audit, returns
 * aggregated counts + bytes. No user text is ever selected or returned.
 * Protected by MIGRATION_AUDIT_CRON_SECRET (or CRON_SECRET).
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert } from "@/lib/safe/safeSupabaseWrite";

const CRON_SECRET_HEADER = "x-cron-secret";
const CRON_SECRET_ENV = "MIGRATION_AUDIT_CRON_SECRET";
const CRON_SECRET_FALLBACK_ENV = "CRON_SECRET";
const AUDITOR = "phase_m1_audit";

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

type AuditPayload = {
  tables: Record<string, { row_count: number; rows_with_text: number; estimated_bytes: number; min_created_at: string | null; max_created_at: string | null }>;
  totals: { total_rows: number; total_rows_with_text: number; total_estimated_bytes: number };
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized", request_id: requestId }, { status: 401 });
  }

  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";

  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server not configured", request_id: requestId },
        { status: 503 }
      );
    }

    // RPC not in generated types; safe: returns only counts/bytes
    const { data: auditResult, error: rpcError } = await (supabaseAdmin as unknown as { rpc(name: string): Promise<{ data: AuditPayload | null; error: unknown }> }).rpc(
      "run_phase_m1_audit"
    );

    if (rpcError || auditResult == null) {
      return NextResponse.json(
        { error: "Audit RPC failed", request_id: requestId },
        { status: 500 }
      );
    }

    const tables = auditResult.tables ?? {};
    const totals = auditResult.totals ?? {
      total_rows: 0,
      total_rows_with_text: 0,
      total_estimated_bytes: 0,
    };

    const { error: insertError } = await safeInsert(
      "migration_audit",
      { environment: env, auditor: AUDITOR, tables, totals },
      undefined,
      supabaseAdmin
    );

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to write audit ledger", request_id: requestId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      request_id: requestId,
      tables,
      totals,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Audit failed", request_id: requestId },
      { status: 500 }
    );
  }
}
