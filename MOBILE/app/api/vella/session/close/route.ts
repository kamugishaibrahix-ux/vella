/**
 * POST /api/vella/session/close
 * Accepts structured SessionSummary + selectedDomains. Triggers governance extraction
 * and post-session contract generation. No raw messages or free text.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/server-auth";
import { extractGovernanceSignalsFromSession } from "@/lib/session/governanceExtraction";
import type { Domain } from "@/lib/contracts/contractTemplates";
import { logSecurityEvent } from "@/lib/telemetry/securityEvents";

const VALID_DOMAINS: Domain[] = [
  "health", "finance", "cognitive", "performance",
  "recovery", "addiction", "relationships", "identity",
];

const sessionSummarySchema = z.object({
  sessionId: z.string().uuid(),
  dominantTopics: z.array(z.string().max(50)),
  emotionalTone: z.enum(["positive", "neutral", "distressed"]),
  contradictionsDetected: z.boolean(),
  valueAlignmentShift: z.boolean(),
});

const bodySchema = z.object({
  summary: sessionSummarySchema,
  selectedDomains: z
    .array(z.enum(VALID_DOMAINS as [Domain, ...Domain[]]))
    .min(1)
    .max(3),
}).strict();

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
    const flat = parsed.error.flatten();
    const hasDomainsError =
      flat.fieldErrors.selectedDomains && flat.fieldErrors.selectedDomains.length > 0;

    if (hasDomainsError) {
      logSecurityEvent("CONTRACT_INVALID_SELECTED_DOMAINS", { user_id: userId });
      return NextResponse.json(
        { error: "Invalid body", code: "INVALID_SELECTED_DOMAINS", details: flat },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "Invalid body", details: flat }, { status: 400 });
  }

  try {
    await extractGovernanceSignalsFromSession(userId, parsed.data.summary);

    // Contract creation removed — contracts are only created via explicit
    // user confirmation through POST /api/session/confirm-contract.

    return NextResponse.json({
      ok: true,
      governanceEventsRecorded: 1,
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to process session close" }, { status: 500 });
  }
}
