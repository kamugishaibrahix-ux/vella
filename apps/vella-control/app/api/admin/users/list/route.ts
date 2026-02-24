import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "users-list", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const { searchParams } = new URL(request.url);
    const flagged = searchParams.get("flagged") === "true";

    const supabase = getAdminClient();
    let query = supabase.from("user_metadata").select("*");

    if (flagged) {
      query = query.eq("flagged_for_review", true);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load user metadata." },
      { status: 500 },
    );
  }
}

