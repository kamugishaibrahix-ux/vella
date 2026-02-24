import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { defaultSystemSettings, type SystemSettingsConfig } from "@/lib/admin/systemSettings";

const systemSettingsSchema = z.object({
  maintenanceMode: z.boolean(),
  enableVoice: z.boolean(),
  enableRealtime: z.boolean(),
  enableMusicMode: z.boolean(),
  maxTokensPerMessage: z.number().min(100).max(10000),
  maxDailyTokensPerUser: z.number().min(1000).max(1000000),
});

const ADMIN_ACTOR_ID =
  process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "system-settings-save", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const json = await request.json();
    const config = systemSettingsSchema.parse(json);

    const supabase = getAdminClient();

    // Find existing active system_settings row
    const { data: existingRows, error: selectError } = await supabase
      .from("admin_ai_config")
      .select("id, config")
      .eq("label", "system_settings")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (selectError) {
      throw selectError;
    }

    const existing = existingRows?.[0] ?? null;

    // Deactivate all other system_settings rows (ensure only one active)
    if (existing) {
      const { error: deactivateError } = await supabase
        .from("admin_ai_config")
        .update({ is_active: false })
        .eq("label", "system_settings")
        .neq("id", existing.id);

      if (deactivateError) {
        throw deactivateError;
      }
    }

    // Upsert the active config
    const upsertPayload = {
      id: existing?.id,
      label: "system_settings",
      is_active: true,
      config: config as SystemSettingsConfig,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("admin_ai_config")
      .upsert(upsertPayload, { onConflict: "id" });

    if (upsertError) {
      throw upsertError;
    }

    // Log the change
    const { error: logError } = await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "system_settings.save",
      previous: existing?.config ?? defaultSystemSettings,
      next: config,
    });

    if (logError) {
      console.warn("[system-settings/save] Failed to log activity", logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({ success: true, data: { config } });
  } catch (error) {
    console.error("[system-settings/save] Error", error);
    let message = "Failed to save system settings.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

