import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import type { ContentLibraryItem, ContentLibraryItemConfig } from "@/lib/admin/contentLibrary";

const updateContentSchema = z.object({
  id: z.string(),
  label: z.string().min(1).optional(),
  config: z
    .object({
      type: z.enum(["persona", "script", "template", "story", "habit", "emotion"]),
      body: z.string(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional(),
    })
    .optional(),
  is_active: z.boolean().optional(),
});

const ADMIN_ACTOR_ID =
  process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "content-library-update", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const json = await request.json();
    const payload = updateContentSchema.parse(json);

    const supabase = getAdminClient();

    // Get existing item
    const { data: existing, error: selectError } = await supabase
      .from("admin_ai_config")
      .select("id, label, config, is_active")
      .eq("id", payload.id)
      .single();

    if (selectError) {
      throw selectError;
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Content item not found." },
        { status: 404 },
      );
    }

    // Build update payload
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (payload.label !== undefined) {
      updateData.label = payload.label;
    }

    if (payload.config !== undefined) {
      updateData.config = payload.config;
    }

    if (payload.is_active !== undefined) {
      updateData.is_active = payload.is_active;
    }

    const { data: updated, error: updateError } = await supabase
      .from("admin_ai_config")
      .update(updateData)
      .eq("id", payload.id)
      .select("id, label, config, is_active, created_at, updated_at")
      .single();

    if (updateError) {
      throw updateError;
    }

    // Log the change
    const { error: logError } = await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "content_library.update",
      previous: existing,
      next: updated,
    });

    if (logError) {
      console.warn("[content-library/update] Failed to log activity", logError);
    }

    const item: ContentLibraryItem = {
      id: updated.id,
      label: updated.label ?? "",
      is_active: updated.is_active ?? false,
      config: updated.config as ContentLibraryItemConfig,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("[content-library/update] Error", error);
    let message = "Failed to update content item.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

