/**
 * POST /api/inbox/proposals — server-side metadata sync for proposal_ready items.
 * Strict schema: metadata only, no free text.
 * Dedupe: rejects if pending proposal for same domain within 72h (409).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveUser, isActiveUserBlocked } from "@/lib/auth/requireActiveUser";
import { fromSafe } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { SIGNAL_SEVERITIES } from "@/lib/osSignals/taxonomy";
import { PROPOSAL_REASON_CODES } from "@/lib/osSignals/proposalEngine";
import { safeErrorLog } from "@/lib/security/logGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Strict Zod schema — metadata only, no free text
// ---------------------------------------------------------------------------

const FOCUS_DOMAINS = [
  "self-mastery",
  "addiction-recovery",
  "emotional-intelligence",
  "relationships",
  "performance-focus",
  "identity-purpose",
  "physical-health",
  "financial-discipline",
] as const;

const proposalCreateSchema = z
  .object({
    proposal_id: z.string().uuid("proposal_id must be a valid UUID"),
    domain: z.enum(FOCUS_DOMAINS),
    severity: z.enum(SIGNAL_SEVERITIES),
    reason_codes: z
      .array(z.enum(PROPOSAL_REASON_CODES))
      .min(1, "At least one reason code required")
      .max(5),
    created_at: z.string().datetime("created_at must be ISO 8601"),
  })
  .strict();

/** Hard-reject any payload that smuggles free-text fields. */
const TEXT_FIELDS = ["text", "title", "content", "body", "journal", "description", "note", "message"];

function payloadContainsText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  for (const key of TEXT_FIELDS) {
    if (key in obj) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Auth
  const authResult = await requireActiveUser();
  if (isActiveUserBlocked(authResult)) {
    return authResult;
  }
  const { userId } = authResult;

  try {
    const json = await req.json().catch(() => null);

    // 2. Reject free-text fields
    const forbidden = payloadContainsText(json);
    if (forbidden) {
      return NextResponse.json(
        { error: { code: "TEXT_NOT_ALLOWED", message: `Field '${forbidden}' must not be sent to server.` } },
        { status: 400 },
      );
    }

    // 3. Validate schema
    const parseResult = proposalCreateSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const data = parseResult.data;

    // 4. Reject if created_at is older than 7 days
    const createdMs = new Date(data.created_at).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (createdMs < sevenDaysAgo) {
      return NextResponse.json(
        { error: { code: "PROPOSAL_TOO_OLD", message: "created_at must be within the last 7 days." } },
        { status: 400 },
      );
    }

    // 5. Server-side dedupe: check for pending proposal in same domain within 72h
    const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data: existing, error: dupeCheckError } = await fromSafe("inbox_proposals_meta")
      .select("id")
      .eq("user_id", userId)
      .eq("domain", data.domain)
      .eq("status", "pending")
      .gte("created_at", cutoff72h)
      .limit(1);

    if (dupeCheckError) {
      safeErrorLog("[inbox/proposals] dedupe check failed", dupeCheckError);
      return NextResponse.json(
        { error: "inbox_proposals_write_failed", code: "INBOX_PROPOSALS_WRITE_FAILED" },
        { status: 500 },
      );
    }

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: { code: "DUPLICATE_PROPOSAL", message: "A pending proposal for this domain already exists within 72h." } },
        { status: 409 },
      );
    }

    // 6. Insert (Supabase union types can make insert() infer as never for this table; narrow to table Insert type)
    type InboxProposalInsert = Database["public"]["Tables"]["inbox_proposals_meta"]["Insert"];
    const payload: InboxProposalInsert = {
      user_id: userId,
      type: "proposal_ready",
      domain: data.domain,
      severity: data.severity,
      proposal_id: data.proposal_id,
      status: "pending",
      created_at: data.created_at,
    };
    const table = fromSafe("inbox_proposals_meta");
    const { error: insertError } = await (table as { insert(values: InboxProposalInsert): ReturnType<typeof table.insert> }).insert(payload);

    if (insertError) {
      safeErrorLog("[inbox/proposals] insert failed", insertError);
      return NextResponse.json(
        { error: "inbox_proposals_write_failed", code: "INBOX_PROPOSALS_WRITE_FAILED" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, proposal_id: data.proposal_id }, { status: 201 });
  } catch (err) {
    safeErrorLog("[inbox/proposals] POST error", err);
    return NextResponse.json(
      { error: "inbox_proposals_write_failed", code: "INBOX_PROPOSALS_WRITE_FAILED" },
      { status: 500 },
    );
  }
}
