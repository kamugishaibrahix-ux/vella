import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  user_id: z.string().uuid(),
  type: z.string(),
  severity: z.string(),
  summary: z.string(),
});

const ADMIN_ACTOR_ID = process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "user-reports-create", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const payload = bodySchema.parse(await request.json());
    const supabase = getAdminClient();

    const { data: report, error: insertError } = await supabase
      .from("user_reports")
      .insert({
        user_id: payload.user_id,
        type: payload.type,
        severity: payload.severity,
        summary: payload.summary,
        status: "open",
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Log admin activity
    await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "user_reports.create",
      previous: null,
      next: { report_id: report.id, user_id: payload.user_id },
    });

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("[api/admin/user-reports/create] Error", error);
    let message = "Failed to create user report.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

