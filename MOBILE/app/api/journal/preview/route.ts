/**
 * POST /api/journal/preview
 * Returns enrichment (loops, distortions, themes, traits) for live preview only.
 * No persistence. Deterministic extraction only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";
import { tagLifeThemes } from "@/lib/journal/tagLifeThemes";
import { detectLoopsInText } from "@/lib/journal/detectLoopsInText";
import { detectDistortionsInText } from "@/lib/journal/detectDistortionsInText";
import { extractTraitMarkers } from "@/lib/journal/extractTraitMarkers";
import { z } from "zod";

const PREVIEW_SCHEMA = z.object({
  text: z.string().max(10000).optional().default(""),
});

const PREVIEW_RATE_LIMIT = { limit: 30, window: 60 };
const ROUTE_KEY = "journal_preview";

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `journal_preview:${userIdOr401}`,
    limit: PREVIEW_RATE_LIMIT.limit,
    window: PREVIEW_RATE_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    const json = await req.json().catch(() => ({}));
    const parseResult = PREVIEW_SCHEMA.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const text = parseResult.data.text ?? "";
    if (!text.trim()) {
      return NextResponse.json({ loops: [], distortions: [], themes: [], traits: [] });
    }

    const [themes, loops, distortions, traits] = await Promise.all([
      tagLifeThemes(text),
      detectLoopsInText(text),
      detectDistortionsInText(text),
      extractTraitMarkers(text),
    ]);

    return NextResponse.json({
      loops,
      distortions,
      themes,
      traits,
    });
  } catch (error) {
    safeErrorLog("[api/journal/preview] error", error);
    return serverErrorResponse();
  }
}
