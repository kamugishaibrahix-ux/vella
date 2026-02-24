import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

export type AdminFeedbackRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  channel: "voice" | "text";
  rating: number | null;
  category: string | null;
  created_at: string;
};

type FeedbackResponse = {
  success: boolean;
  data: AdminFeedbackRow[];
  error?: string;
};

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "feedback-list", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("feedback")
      .select("id, user_id, session_id, channel, rating, category, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      // Handle missing table gracefully (PGRST205 = table not found)
      if (error.code === "PGRST205" || error.message?.includes("relation") || error.message?.includes("does not exist")) {
        console.warn("[api/admin/feedback/list] Feedback table not found, returning empty list");
        return NextResponse.json({ success: true, data: [] } as FeedbackResponse);
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: (data ?? []) as AdminFeedbackRow[],
    } as FeedbackResponse);
  } catch (error) {
    console.error("[api/admin/feedback/list] Error loading feedback", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load feedback",
        data: [],
      } as FeedbackResponse,
      { status: 500 },
    );
  }
}

