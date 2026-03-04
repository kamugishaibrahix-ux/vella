/**
 * Phase 6B: Check-in API. All reads/writes from Supabase check_ins_v2. No localStorage.
 *
 * NAMING STANDARD: "checkin" (no dash/hyphen) used consistently:
 * - Route path: /api/check-ins (kept for URL backward compatibility)
 * - Rate limit keys: checkin_read, checkin_write
 * - Database table: check_ins_v2
 * - Library functions: checkins/db.ts
 * - Internal references: checkin (not check_in, not check-in)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response } from "@/lib/security/rateLimit";
import {
  listCheckInsFromDb,
  createCheckInInDb,
  updateCheckInInDb,
  deleteCheckInInDb,
  hasLegacyCheckInsData,
} from "@/lib/checkins/db";
import { getMigrationState, migrationRequiredResponse } from "@/lib/migration/state";
import { serverErrorResponse, notFoundResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";
import { SafeDataError, serverTextStorageBlockedResponse } from "@/lib/safe/safeSupabaseWrite";
import {
  assertNoPII,
  PIIFirewallError,
  piiBlockedJsonResponse,
} from "@/lib/security/piiFirewall";

const READ_LIMIT = { limit: 60, window: 60 };
const WRITE_LIMIT = { limit: 30, window: 60 };

const createBodySchema = z.object({
  entry_date: z.string(),
  mood: z.number().nullable().optional(),
  stress: z.number().nullable().optional(),
  energy: z.number().nullable().optional(),
  focus: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
});

const updateBodySchema = z.object({
  id: z.string().uuid(),
  entry_date: z.string().optional(),
  mood: z.number().nullable().optional(),
  stress: z.number().nullable().optional(),
  energy: z.number().nullable().optional(),
  focus: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
});

export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  // Phase 3.3: Rate limit with explicit policy (FAIL-OPEN)
  const readRateResult = await rateLimit({
    key: `checkin:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: "checkin_read",
  });
  if (!readRateResult.allowed && readRateResult.status === 429) {
    return rateLimit429Response(readRateResult.retryAfterSeconds);
  }

  try {
    const rows = await listCheckInsFromDb(userId, 200);
    if (rows.length === 0) {
      const hasLegacy = await hasLegacyCheckInsData(userId);
      if (hasLegacy) {
        const state = await getMigrationState(userId);
        return migrationRequiredResponse(state?.status ?? "NOT_STARTED", crypto.randomUUID());
      }
    }
    const checkins = rows.map((r) => ({
      id: r.id,
      entry_date: r.entry_date,
      mood: r.mood ?? 0,
      stress: r.stress ?? 0,
      energy: r.energy ?? 0,
      focus: r.focus ?? 0,
      created_at: r.created_at,
      note: r.note ?? null,
    }));
    return NextResponse.json({ checkins });
  } catch (error) {
    safeErrorLog("[api/check-ins] GET error", error);
    return serverErrorResponse();
  }
}

/**
 * PHASE SEAL HARDENING (20260240):
 * Check-ins are LOCAL-FIRST. Personal notes are NEVER stored in Supabase.
 * - Mood/stress/energy/focus scores: stored in Supabase (metadata)
 * - Personal notes: stripped before database write, stored in encrypted IndexedDB via client
 * - Database table check_ins_v2 contains NO note column
 */
export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  // Phase 3.3: Rate limit with explicit policy (FAIL-OPEN)
  const writeRateResult = await rateLimit({
    key: `checkin:${userId}`,
    limit: WRITE_LIMIT.limit,
    window: WRITE_LIMIT.window,
    routeKey: "checkin_write",
  });
  if (!writeRateResult.allowed && writeRateResult.status === 429) {
    return rateLimit429Response(writeRateResult.retryAfterSeconds);
  }

  try {
    const json = await req.json().catch(() => null);
    const parsed = createBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }

    // Phase Seal: Strip personal note before database write
    // The note is stored encrypted in client-side IndexedDB, NOT in Supabase
    const { note, ...metadataOnly } = parsed.data;

    // Phase Seal: Verify no personal text in metadata
    try {
      assertNoPII(metadataOnly, "check_ins_v2");
    } catch (piiError) {
      if (piiError instanceof PIIFirewallError) {
        return NextResponse.json(piiBlockedJsonResponse(), { status: 403 });
      }
      throw piiError;
    }

    // Client is responsible for storing the note in encrypted local storage
    // This API only stores the metadata (scores, timestamps)
    const row = await createCheckInInDb(userId, metadataOnly);

    // Return note back to client (they need it for local storage)
    // But don't store it in the database
    return NextResponse.json({
      checkin: {
        id: row.id,
        entry_date: row.entry_date,
        mood: row.mood ?? 0,
        stress: row.stress ?? 0,
        energy: row.energy ?? 0,
        focus: row.focus ?? 0,
        created_at: row.created_at,
        note: note ?? null, // Return to client for local storage
      },
    });
  } catch (error) {
    if (error instanceof SafeDataError && error.code === "WRITE_BLOCKED_TABLE") {
      return serverTextStorageBlockedResponse();
    }
    if (error instanceof PIIFirewallError) {
      return NextResponse.json(piiBlockedJsonResponse(), { status: 403 });
    }
    safeErrorLog("[api/check-ins] POST error", error);
    return serverErrorResponse();
  }
}

export async function PATCH(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  // Phase 3.3: Rate limit with explicit policy (FAIL-OPEN)
  const patchRateResult = await rateLimit({
    key: `checkin:${userId}`,
    limit: WRITE_LIMIT.limit,
    window: WRITE_LIMIT.window,
    routeKey: "checkin_write",
  });
  if (!patchRateResult.allowed && patchRateResult.status === 429) {
    return rateLimit429Response(patchRateResult.retryAfterSeconds);
  }

  try {
    const json = await req.json().catch(() => null);
    const parsed = updateBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }
    const { id, note, ...patchMetadata } = parsed.data;

    // Phase Seal: Strip personal note before database write
    // The note is stored encrypted in client-side IndexedDB, NOT in Supabase

    // Phase Seal: Verify no personal text in metadata
    try {
      assertNoPII(patchMetadata, "check_ins_v2");
    } catch (piiError) {
      if (piiError instanceof PIIFirewallError) {
        return NextResponse.json(piiBlockedJsonResponse(), { status: 403 });
      }
      throw piiError;
    }

    const updated = await updateCheckInInDb(userId, id, patchMetadata);
    if (!updated) return notFoundResponse();

    // Return note back to client for local storage
    return NextResponse.json({
      checkin: {
        id: updated.id,
        entry_date: updated.entry_date,
        mood: updated.mood ?? 0,
        stress: updated.stress ?? 0,
        energy: updated.energy ?? 0,
        focus: updated.focus ?? 0,
        created_at: updated.created_at,
        note: note ?? null, // Return to client for local storage
      },
    });
  } catch (error) {
    if (error instanceof SafeDataError && error.code === "WRITE_BLOCKED_TABLE") {
      return serverTextStorageBlockedResponse();
    }
    if (error instanceof PIIFirewallError) {
      return NextResponse.json(piiBlockedJsonResponse(), { status: 403 });
    }
    safeErrorLog("[api/check-ins] PATCH error", error);
    return serverErrorResponse();
  }
}

export async function DELETE(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  // Phase 3.3: Rate limit with explicit policy (FAIL-OPEN)
  const deleteRateResult = await rateLimit({
    key: `checkin:${userId}`,
    limit: WRITE_LIMIT.limit,
    window: WRITE_LIMIT.window,
    routeKey: "checkin_write",
  });
  if (!deleteRateResult.allowed && deleteRateResult.status === 429) {
    return rateLimit429Response(deleteRateResult.retryAfterSeconds);
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    const ok = await deleteCheckInInDb(userId, id);
    if (!ok) return notFoundResponse();
    return NextResponse.json({ ok: true });
  } catch (error) {
    safeErrorLog("[api/check-ins] DELETE error", error);
    return serverErrorResponse();
  }
}
