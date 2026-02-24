import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "user-reports-list", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const userId = searchParams.get("user_id");

    const supabase = getAdminClient();
    let query = supabase
      .from("user_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }
    if (severity) {
      query = query.eq("severity", severity);
    }
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
    });
  } catch (error) {
    console.error("[api/admin/user-reports/list] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to load user reports." },
      { status: 500 },
    );
  }
}

