import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { adminConfigSchema } from "@/lib/validators/adminConfigSchema";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  config: adminConfigSchema,
});

const ADMIN_ACTOR_ID =
  process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "config-save", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const json = await request.json();
    const { config } = bodySchema.parse(json);

    const supabase = getAdminClient();

    // Find existing active config row
    const { data: existingRows, error: selectError } = await supabase
      .from("admin_ai_config")
      .select("id, config")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (selectError) {
      throw selectError;
    }

    const existing = existingRows?.[0] ?? null;

    // Deactivate all other rows (ensure only one active)
    if (existing) {
      const { error: deactivateError } = await supabase
        .from("admin_ai_config")
        .update({ is_active: false })
        .neq("id", existing.id);

      if (deactivateError) {
        throw deactivateError;
      }
    }

    // Upsert the active config
    const upsertPayload = {
      id: existing?.id,
      is_active: true,
      config,
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
      action: "config.save",
      previous: existing?.config ?? null,
      next: config,
    });

    if (logError) {
      throw logError;
    }

    return NextResponse.json({ success: true, data: { config } });
  } catch (error) {
    console.error(error);
    let message = "Failed to save configuration.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

