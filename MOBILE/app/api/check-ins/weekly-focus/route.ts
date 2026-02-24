/**
 * POST /api/check-ins/weekly-focus — store daily focus ratings (structured only).
 * No free text. Writes to behaviour_events as weekly_focus_checkin.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/server-auth";
import { recordEvent } from "@/lib/governance/events";
import { GOVERNANCE_SUBJECT_CODES } from "@/lib/governance/validation";
import { WEEKLY_FOCUS_SOURCE_TYPES } from "@/lib/focus/focusEngine";

const WEEK_ID_REGEX = /^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
const ITEM_ID_REGEX = /^wf_[a-z]+_[a-z0-9_]+_[a-z0-9]+$/;

const ratingSchema = z.object({
  itemId: z.string().max(80).regex(ITEM_ID_REGEX, "Invalid itemId format"),
  subjectCode: z.enum(GOVERNANCE_SUBJECT_CODES),
  sourceType: z.enum(WEEKLY_FOCUS_SOURCE_TYPES),
  rating: z.enum(["strong", "neutral", "struggling"]),
});

const bodySchema = z.object({
  weekId: z.string().regex(WEEK_ID_REGEX, "Invalid weekId"),
  dateIso: z.string().regex(ISO_DATE_REGEX, "Invalid dateIso"),
  ratings: z.array(ratingSchema).max(5),
  note: z.string().max(200).optional(),
});

const RATING_TO_NUM: Record<string, number> = {
  strong: 2,
  neutral: 1,
  struggling: 0,
};

function toOccurredAt(dateIso: string): string {
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateIso)) return dateIso;
  return `${dateIso}T12:00:00.000Z`;
}

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof NextResponse) return userIdOr401;
  const userId = userIdOr401;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const { weekId, dateIso, ratings, note } = parsed.data;

  const itemIds = ratings.map((r) => r.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    return NextResponse.json({ error: "validation_error", details: "duplicate itemIds" }, { status: 400 });
  }
  const subjectCodes = ratings.map((r) => r.subjectCode);
  if (new Set(subjectCodes).size !== subjectCodes.length) {
    return NextResponse.json({ error: "validation_error", details: "duplicate subjectCodes" }, { status: 400 });
  }

  const occurredAt = toOccurredAt(dateIso);

  for (const r of ratings) {
    const numericValue = RATING_TO_NUM[r.rating];
    const metadataCode: Record<string, string | number> = {
      week_id: weekId,
      item_id: r.itemId,
      source_type: r.sourceType,
    };
    if (note != null && note.trim() !== "") {
      metadataCode.note = note.trim();
    }
    const result = await recordEvent(
      userId,
      "weekly_focus_checkin",
      r.subjectCode,
      numericValue,
      metadataCode,
      occurredAt
    );
    if (!result.success) {
      return NextResponse.json({ error: "write_failed", message: result.error }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
