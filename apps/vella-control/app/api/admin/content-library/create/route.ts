import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import type { ContentLibraryItem, ContentLibraryItemConfig } from "@/lib/admin/contentLibrary";

const CONTENT_TYPES = ["persona", "script", "template", "story", "habit", "emotion"];

const createContentSchema = z.object({
  label: z.string().min(1),
  config: z.object({
    type: z.enum(["persona", "script", "template", "story", "habit", "emotion"]),
    body: z.string(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
  }),
  is_active: z.boolean().optional().default(true),
});

const ADMIN_ACTOR_ID =
  process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "content-library-create", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const json = await request.json();
    const payload = createContentSchema.parse(json);

    const supabase = getAdminClient();

    const insertPayload = {
      label: payload.label,
      config: payload.config as ContentLibraryItemConfig,
      is_active: payload.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error: insertError } = await supabase
      .from("admin_ai_config")
      .insert(insertPayload)
      .select("id, label, config, is_active, created_at, updated_at")
      .single();

    if (insertError) {
      throw insertError;
    }

    // Log the change
    const { error: logError } = await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "content_library.create",
      previous: null,
      next: payload,
    });

    if (logError) {
      console.warn("[content-library/create] Failed to log activity", logError);
    }

    const item: ContentLibraryItem = {
      id: data.id,
      label: data.label ?? "",
      is_active: data.is_active ?? false,
      config: data.config as ContentLibraryItemConfig,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("[content-library/create] Error", error);
    let message = "Failed to create content item.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

