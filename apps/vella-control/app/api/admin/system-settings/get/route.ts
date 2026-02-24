import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { defaultSystemSettings } from "@/lib/admin/systemSettings";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "system-settings-get", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("admin_ai_config")
      .select("config")
      .eq("label", "system_settings")
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data || !data.config) {
      return NextResponse.json({
        success: true,
        data: defaultSystemSettings,
        source: "default",
      });
    }

    return NextResponse.json({
      success: true,
      data: data.config,
      source: "db",
    });
  } catch (error) {
    console.error("[system-settings/get] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to load system settings." },
      { status: 500 },
    );
  }
}

