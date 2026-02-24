/**
 * Phase 6C: Backfill chunks from last N days for a user. Service-key only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceServiceKeyProtection,
  readBodyWithLimit,
  MAX_SERVICE_KEY_BODY_BYTES,
} from "@/lib/security/serviceKeyProtection";
import { fromSafe } from "@/lib/supabase/admin";
import { chunkSnapshot } from "@/lib/memory/chunking";
import { upsertChunksForSource } from "@/lib/memory/db";
import { safeErrorLog } from "@/lib/security/logGuard";
import { SafeDataError, serverTextStorageBlockedResponse } from "@/lib/safe/safeSupabaseWrite";

const bodySchema = z
  .object({
    userId: z.string().uuid(),
    days: z.number().min(1).max(30).optional(),
  })
  .strict();

function isAuthorized(req: NextRequest): boolean {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const header = req.headers.get("authorization") ?? "";
  return Boolean(serviceKey && header === `Bearer ${serviceKey}`);
}

export async function POST(req: NextRequest) {
  const protectionResponse = await enforceServiceKeyProtection(req, "memory_reindex");
  if (protectionResponse) return protectionResponse;
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await readBodyWithLimit(req, MAX_SERVICE_KEY_BODY_BYTES);
    const parsed = bodySchema.safeParse(rawBody ? (JSON.parse(rawBody) as unknown) : {});
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }
    const { userId, days = 7 } = parsed.data;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    let journalCount = 0;
    let conversationCount = 0;
    let snapshotCount = 0;

    // M2 Patch: No legacy reads. journal_entries_v2 / conversation_metadata_v2 have no content to chunk.
    // Journal and conversation chunking skipped; only snapshots (behavioural_state_history) are indexed.

    const { data: snapRows } = await fromSafe("behavioural_state_history")
      .select("id, state_json")
      .eq("user_id", userId)
      .gte("created_at", sinceISO);
    const snapshots = (snapRows ?? []) as { id: string; state_json: unknown }[];
    for (const row of snapshots) {
      const stateJson = (row.state_json as Record<string, unknown>) ?? {};
      const chunks = chunkSnapshot(stateJson);
      await upsertChunksForSource({ userId, sourceType: "snapshot", sourceId: row.id, chunks });
      snapshotCount++;
    }

    return NextResponse.json({
      ok: true,
      journal: journalCount,
      conversation: conversationCount,
      snapshot: snapshotCount,
    });
  } catch (err) {
    if (err instanceof SafeDataError && err.code === "WRITE_BLOCKED_TABLE") {
      return serverTextStorageBlockedResponse();
    }
    if (err instanceof Error && err.message === "BODY_TOO_LARGE") {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    safeErrorLog("[api/memory/reindex] error", err);
    return NextResponse.json({ error: "reindex_failed" }, { status: 500 });
  }
}
