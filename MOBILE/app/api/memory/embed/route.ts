/**
 * Phase 6C: Embed pending chunks. Service-key only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceServiceKeyProtection,
  readBodyWithLimit,
  MAX_SERVICE_KEY_BODY_BYTES,
} from "@/lib/security/serviceKeyProtection";
import { listUnembeddedChunks, markChunkEmbedded } from "@/lib/memory/db";
import { embedText, getEmbeddingModelName } from "@/lib/memory/embed";
import { safeErrorLog } from "@/lib/security/logGuard";
import { SafeDataError, serverTextStorageBlockedResponse } from "@/lib/safe/safeSupabaseWrite";

const bodySchema = z
  .object({
    limit: z.number().min(1).max(50).optional(),
    userId: z.string().uuid().optional(),
  })
  .strict();

function isAuthorized(req: NextRequest): boolean {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const header = req.headers.get("authorization") ?? "";
  return Boolean(serviceKey && header === `Bearer ${serviceKey}`);
}

const BATCH_SIZE = 16;

export async function POST(req: NextRequest) {
  const protectionResponse = await enforceServiceKeyProtection(req, "memory_embed");
  if (protectionResponse) return protectionResponse;
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await readBodyWithLimit(req, MAX_SERVICE_KEY_BODY_BYTES);
    const parsed = bodySchema.safeParse(rawBody ? (JSON.parse(rawBody) as unknown) : {});
    const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;
    const userId = parsed.success ? parsed.data.userId : undefined;

    const chunks = await listUnembeddedChunks({ userId, limit });
    if (chunks.length === 0) {
      return NextResponse.json({ embedded: 0, skipped: 0, errors: 0 });
    }

    const model = getEmbeddingModelName();
    let embedded = 0;
    let errors = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.content);
      try {
        const vectors = await embedText(texts);
        for (let j = 0; j < batch.length; j++) {
          if (vectors[j]) {
            await markChunkEmbedded({ chunkId: batch[j].id, embedding: vectors[j], model });
            embedded++;
          }
        }
      } catch (err) {
        safeErrorLog("[api/memory/embed] batch error", err);
        errors += batch.length;
      }
    }

    return NextResponse.json({ embedded, skipped: chunks.length - embedded - errors, errors });
  } catch (err) {
    if (err instanceof SafeDataError && err.code === "WRITE_BLOCKED_TABLE") {
      return serverTextStorageBlockedResponse();
    }
    if (err instanceof Error && err.message === "BODY_TOO_LARGE") {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    safeErrorLog("[api/memory/embed] error", err);
    return NextResponse.json({ error: "embed_failed" }, { status: 500 });
  }
}
