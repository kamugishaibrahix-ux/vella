import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import {
  journalCreateSchema,
  journalUpdateSchema,
  journalPayloadContainsText,
} from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { createJournalMeta, updateJournalMeta } from "@/lib/journal/server";
import { safeErrorLog } from "@/lib/security/logGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Hard-reject any payload that smuggles free-text fields. */
function textRejection(field: string) {
  return NextResponse.json(
    { error: { code: "TEXT_NOT_ALLOWED", message: `Field '${field}' must not be sent to server. Text stays on-device.` } },
    { status: 400 },
  );
}

export async function GET(_req: NextRequest) {
  return NextResponse.json({ status: "ok" });
}

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    const json = await req.json().catch(() => null);

    // Pre-check: reject any free-text fields before Zod parsing
    const forbidden = journalPayloadContainsText(json);
    if (forbidden) return textRejection(forbidden);

    const parseResult = journalCreateSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const meta = parseResult.data;
    const entry = await createJournalMeta(userId, meta);
    return NextResponse.json(entry);
  } catch (err) {
    safeErrorLog("[journal] POST error", err);
    return NextResponse.json({ error: "journal_create_failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    const json = await req.json().catch(() => null);

    // Pre-check: reject any free-text fields before Zod parsing
    const forbidden = journalPayloadContainsText(json);
    if (forbidden) return textRejection(forbidden);

    const parseResult = journalUpdateSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const meta = parseResult.data;
    const entry = await updateJournalMeta(userId, meta);
    return NextResponse.json(entry);
  } catch (err) {
    safeErrorLog("[journal] PUT error", err);
    return NextResponse.json({ error: "journal_update_failed" }, { status: 500 });
  }
}

export async function PATCH(_req: NextRequest) {
  return NextResponse.json({ status: "ok" });
}
