/**
 * Phase 6B: Check-ins API. All reads/writes from Supabase check_ins. No localStorage.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
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

  try {
    await rateLimit({ key: `read:checkins:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
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

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `write:checkins:${userId}`, limit: WRITE_LIMIT.limit, window: WRITE_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const json = await req.json().catch(() => null);
    const parsed = createBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }
    const row = await createCheckInInDb(userId, parsed.data);
    return NextResponse.json({
      checkin: {
        id: row.id,
        entry_date: row.entry_date,
        mood: row.mood ?? 0,
        stress: row.stress ?? 0,
        energy: row.energy ?? 0,
        focus: row.focus ?? 0,
        created_at: row.created_at,
        note: row.note ?? null,
      },
    });
  } catch (error) {
    if (error instanceof SafeDataError && error.code === "WRITE_BLOCKED_TABLE") {
      return serverTextStorageBlockedResponse();
    }
    safeErrorLog("[api/check-ins] POST error", error);
    return serverErrorResponse();
  }
}

export async function PATCH(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `write:checkins:${userId}`, limit: WRITE_LIMIT.limit, window: WRITE_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const json = await req.json().catch(() => null);
    const parsed = updateBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
    }
    const { id, ...patch } = parsed.data;
    const updated = await updateCheckInInDb(userId, id, patch);
    if (!updated) return notFoundResponse();
    return NextResponse.json({
      checkin: {
        id: updated.id,
        entry_date: updated.entry_date,
        mood: updated.mood ?? 0,
        stress: updated.stress ?? 0,
        energy: updated.energy ?? 0,
        focus: updated.focus ?? 0,
        created_at: updated.created_at,
        note: updated.note ?? null,
      },
    });
  } catch (error) {
    if (error instanceof SafeDataError && error.code === "WRITE_BLOCKED_TABLE") {
      return serverTextStorageBlockedResponse();
    }
    safeErrorLog("[api/check-ins] PATCH error", error);
    return serverErrorResponse();
  }
}

export async function DELETE(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `write:checkins:${userId}`, limit: WRITE_LIMIT.limit, window: WRITE_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
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
