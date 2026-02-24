import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "config-get", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("admin_ai_config")
      .select("config, is_active, created_at, updated_at, label")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    // Return the config object (not the whole row) to match client expectations
    return NextResponse.json({
      success: true,
      data: data?.config ?? null,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load admin configuration." },
      { status: 500 },
    );
  }
}

