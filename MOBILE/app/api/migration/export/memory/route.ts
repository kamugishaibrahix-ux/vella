/**
 * MIGRATION EXPORT ONLY. GET /api/migration/export/memory
 * Exports legacy memory_chunks metadata (no content). Paginated.
 * Requires X-Migration-Token. Never log response body.
 */

import { NextRequest, NextResponse } from "next/server";
import { fromSafe } from "@/lib/supabase/admin";
import { guardMigrationExport, NO_CACHE_HEADERS } from "@/lib/migration/exportGuard";
import { logExportAudit } from "@/lib/migration/exportAudit";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  const guard = await guardMigrationExport(req, "memory");
  if (guard instanceof Response) return guard;
  const { userId, requestId } = guard;

  const url = new URL(req.url);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(PAGE_SIZE), 10)));

  try {
    const { data, error } = await fromSafe("memory_chunks")
      .select("id, user_id, source_type, source_id, chunk_index, content_hash, token_estimate, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      await logExportAudit("memory", userId, offset, limit, requestId, false);
      return NextResponse.json({ error: "export_failed" }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    const rows = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      user_id: r.user_id,
      source_type: r.source_type,
      source_id: r.source_id,
      chunk_index: r.chunk_index,
      content_hash: r.content_hash,
      token_estimate: r.token_estimate,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    await logExportAudit("memory", userId, offset, limit, requestId, true);
    return NextResponse.json(
      { data: rows, offset, limit, has_more: rows.length === limit },
      { status: 200, headers: { ...NO_CACHE_HEADERS, "Content-Type": "application/json" } }
    );
  } catch {
    await logExportAudit("memory", userId, offset, limit, requestId, false);
    return NextResponse.json({ error: "export_failed" }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
