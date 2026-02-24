import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const deleteContentSchema = z.object({
  id: z.string(),
});

const ADMIN_ACTOR_ID =
  process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "content-library-delete", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const json = await request.json();
    const payload = deleteContentSchema.parse(json);

    const supabase = getAdminClient();

    // Get existing item for logging
    const { data: existing, error: selectError } = await supabase
      .from("admin_ai_config")
      .select("id, label, config")
      .eq("id", payload.id)
      .single();

    if (selectError && selectError.code !== "PGRST116") {
      // PGRST116 = not found, which is fine for delete
      throw selectError;
    }

    // Delete the row
    const { error: deleteError } = await supabase
      .from("admin_ai_config")
      .delete()
      .eq("id", payload.id);

    if (deleteError) {
      throw deleteError;
    }

    // Log the change
    if (existing) {
      const { error: logError } = await supabase.from("admin_activity_log").insert({
        admin_id: ADMIN_ACTOR_ID,
        action: "content_library.delete",
        previous: existing,
        next: null,
      });

      if (logError) {
        console.warn("[content-library/delete] Failed to log activity", logError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[content-library/delete] Error", error);
    let message = "Failed to delete content item.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

