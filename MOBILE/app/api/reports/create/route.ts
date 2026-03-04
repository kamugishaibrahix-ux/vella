import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert } from "@/lib/safe/safeSupabaseWrite";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

const bodySchema = z
  .object({
    type: z.string().min(1).max(64),
    severity: z.string().min(1).max(32),
    summary: z.string().min(1).max(2000),
  })
  .strict();

const RATE_LIMIT_REPORTS = { limit: 10, window: 60 };
const ROUTE_KEY = "reports_create";

export async function POST(request: Request) {
  try {
    const userIdOr401 = await requireUserId();
    if (userIdOr401 instanceof Response) return userIdOr401;
    const userId = userIdOr401;

    const rateLimitResult = await rateLimit({
      key: `reports_create:${userId}`,
      limit: RATE_LIMIT_REPORTS.limit,
      window: RATE_LIMIT_REPORTS.window,
      routeKey: ROUTE_KEY,
    });
    if (!rateLimitResult.allowed) {
      if (rateLimitResult.status === 503) return rateLimit503Response();
      return rateLimit429Response(rateLimitResult.retryAfterSeconds);
    }

    const body = bodySchema.parse(await request.json());

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Server not configured." }, { status: 503 });
    }

    // M2: write metadata only to user_reports_v2 (no summary/notes)
    const severityNum = Number.parseInt(body.severity, 10) || 0;
    const { error } = await safeInsert(
      "user_reports_v2",
      {
        user_id: userId,
        report_type: body.type,
        severity: severityNum,
        status: "open",
      } as Record<string, unknown>,
      undefined,
      supabaseAdmin,
    );
    if (error) {
      safeErrorLog("[api/reports/create] Error", error);
      return NextResponse.json({ success: false, error: "Failed to submit report." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    safeErrorLog("[api/reports/create] Error", error);
    const message = error instanceof z.ZodError ? "VALIDATION_ERROR" : "Failed to submit report.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

