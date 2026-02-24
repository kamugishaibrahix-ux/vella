/**
 * Phase 6C: Create chunk rows for a source. Service-key only.
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

const bodySchema = z.object({
  userId: z.string().uuid(),
  sourceType: z.enum(["journal", "conversation", "snapshot"]),
  sourceId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
}).strict();

function isAuthorized(req: NextRequest): boolean {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const header = req.headers.get("authorization") ?? "";
  return Boolean(serviceKey && header === `Bearer ${serviceKey}`);
}

export async function POST(req: NextRequest) {
  const protectionResponse = await enforceServiceKeyProtection(req, "memory_chunk");
  if (protectionResponse) return protectionResponse;
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await readBodyWithLimit(req, MAX_SERVICE_KEY_BODY_BYTES);
    const parsed = bodySchema.safeParse(rawBody ? JSON.parse(rawBody) : {});
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }
    const { userId, sourceType, sourceId, sessionId } = parsed.data;

    let chunks: { chunk_index: number; content: string; content_hash: string; token_estimate: number }[];

    if (sourceType === "journal") {
      // M2 Patch: journal_entries_v2 has no content; cannot chunk. Return empty.
      const { data } = await fromSafe("journal_entries_v2")
        .select("id").eq("user_id", userId).eq("id", sourceId).maybeSingle();
      if (!data) return NextResponse.json({ error: "not_found", message: "Journal entry not found" }, { status: 404 });
      chunks = [];
    } else if (sourceType === "conversation") {
      // M2 Patch: No legacy conversation_messages read. No content in v2 to chunk.
      chunks = [];
    } else {
      const { data, error } = await fromSafe("behavioural_state_history")
        .select("state_json").eq("user_id", userId).eq("id", sourceId).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "not_found", message: "Snapshot not found" }, { status: 404 });
      const stateJson = (data as { state_json: unknown }).state_json as Record<string, unknown>;
      chunks = chunkSnapshot(stateJson ?? {});
    }

    const { inserted } = await upsertChunksForSource({ userId, sourceType, sourceId, chunks });
    return NextResponse.json({ ok: true, chunks: chunks.length, inserted });
  } catch (err) {
    if (err instanceof SafeDataError && err.code === "WRITE_BLOCKED_TABLE") {
      return serverTextStorageBlockedResponse();
    }
    if (err instanceof Error && err.message === "BODY_TOO_LARGE") {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    safeErrorLog("[api/memory/chunk] error", err);
    return NextResponse.json({ error: "chunk_failed" }, { status: 500 });
  }
}
