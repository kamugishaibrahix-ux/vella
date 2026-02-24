/**
 * Phase M3.5: Audit log for migration export requests. Metadata only; no user content.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert } from "@/lib/safe/safeSupabaseWrite";

function hashUserId(userId: string): string {
  try {
    const { createHash } = require("crypto") as { createHash: (algo: string) => { update: (d: string) => { digest: (enc: string) => string } } };
    return createHash("sha256").update(userId).digest("hex");
  } catch {
    return "";
  }
}

export async function logExportAudit(
  exportType: string,
  userId: string,
  offset: number,
  limit: number,
  requestId: string | null,
  success: boolean
): Promise<void> {
  if (!supabaseAdmin) return;
  const user_id_hash = hashUserId(userId);
  try {
    await safeInsert(
      "migration_export_audit",
      {
        export_type: exportType,
        user_id_hash,
        offset,
        limit,
        request_id: requestId,
        success,
      } as Record<string, unknown>,
      undefined,
      supabaseAdmin
    );
  } catch {
    // Best-effort; do not fail the request
  }
}
