/**
 * POST /api/vella/session/close
 * Accepts structured SessionSummary only. Triggers governance extraction.
 * No raw messages or free text. Server calls recordEvent with codes only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/server-auth";
import { extractGovernanceSignalsFromSession } from "@/lib/session/governanceExtraction";

const sessionSummarySchema = z.object({
  sessionId: z.string().uuid(),
  dominantTopics: z.array(z.string().max(50)),
  emotionalTone: z.enum(["positive", "neutral", "distressed"]),
  contradictionsDetected: z.boolean(),
  valueAlignmentShift: z.boolean(),
});

const bodySchema = z.object({ summary: sessionSummarySchema }).strict();

export async function POST(req: Request) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await extractGovernanceSignalsFromSession(userId, parsed.data.summary);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[vella/session/close]", err);
    return NextResponse.json({ error: "Failed to record governance signals" }, { status: 500 });
  }
}
