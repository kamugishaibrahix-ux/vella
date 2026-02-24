/**
 * M4.5: Legacy user_reports summary/notes columns dropped. Export disabled.
 * GET /api/migration/export/reports returns 410 Gone.
 */

import { NextResponse } from "next/server";
import { guardMigrationExport, NO_CACHE_HEADERS } from "@/lib/migration/exportGuard";

export async function GET(req: Request) {
  const guard = await guardMigrationExport(req, "reports");
  if (guard instanceof Response) return guard;
  return NextResponse.json(
    { error: "legacy_schema_dropped" },
    { status: 410, headers: NO_CACHE_HEADERS }
  );
}
