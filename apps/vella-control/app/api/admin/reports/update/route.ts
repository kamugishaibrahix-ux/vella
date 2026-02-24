import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  report_id: z.string().uuid(),
  status: z.string().optional(),
  assignee: z.string().uuid().nullable().optional(),
  resolved_notes: z.string().nullable().optional(),
});

const ADMIN_ACTOR_ID = process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "reports-update", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const payload = bodySchema.parse(await request.json());
    const supabase = getAdminClient();

    // Get current state
    const { data: currentReport, error: selectError } = await supabase
      .from("user_reports")
      .select("*")
      .eq("id", payload.report_id)
      .single();

    if (selectError) {
      throw selectError;
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (payload.status !== undefined) {
      updateData.status = payload.status;
    }
    if (payload.assignee !== undefined) {
      updateData.assignee = payload.assignee;
    }
    if (payload.resolved_notes !== undefined) {
      updateData.notes = payload.resolved_notes;
    }

    const { data: updatedReport, error: updateError } = await supabase
      .from("user_reports")
      .update(updateData)
      .eq("id", payload.report_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Log admin activity
    await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "reports.update",
      previous: {
        status: currentReport.status,
        assignee: currentReport.assignee,
        notes: currentReport.notes,
      },
      next: {
        status: updatedReport.status,
        assignee: updatedReport.assignee,
        notes: updatedReport.notes,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedReport,
    });
  } catch (error) {
    console.error("[api/admin/reports/update] Error", error);
    let message = "Failed to update report.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

