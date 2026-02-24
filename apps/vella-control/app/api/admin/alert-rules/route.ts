import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const ALERT_RULES_LABEL = "alert_rules";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "alert-rules", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();

    // Get alert rules from admin_ai_config
    const { data: config, error: configError } = await supabase
      .from("admin_ai_config")
      .select("config")
      .eq("label", ALERT_RULES_LABEL)
      .eq("is_active", true)
      .single();

    if (configError && configError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is fine
      throw configError;
    }

    const rules = (config?.config as { rules?: unknown[] })?.rules ?? [];

    return NextResponse.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    console.error("[api/admin/alert-rules] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to load alert rules." },
      { status: 500 },
    );
  }
}

