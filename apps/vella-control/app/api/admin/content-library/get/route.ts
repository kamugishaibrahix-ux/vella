import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import type { ContentLibraryItem } from "@/lib/admin/contentLibrary";

const idParamSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, "id must contain only letters, numbers, underscore, and hyphen");

const CONTENT_TYPES = ["persona", "script", "template", "story", "habit", "emotion"];

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "content-library-get", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const { searchParams } = new URL(request.url);
    const idRaw = searchParams.get("id");
    if (idRaw == null || idRaw === "") {
      return NextResponse.json(
        { success: false, error: "Missing id parameter." },
        { status: 400 },
      );
    }
    const parsed = idParamSchema.safeParse(idRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", details: "id must be 1–64 characters (letters, numbers, underscore, hyphen)." },
        { status: 400 },
      );
    }
    const id = parsed.data;

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from("admin_ai_config")
      .select("id, label, config, is_active, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: "Content item not found." },
        { status: 404 },
      );
    }

    // Validate that this is a content item
    if (!data.config || typeof data.config !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid content item." },
        { status: 400 },
      );
    }

    const config = data.config as any;
    if (!config.type || !CONTENT_TYPES.includes(config.type)) {
      return NextResponse.json(
        { success: false, error: "Not a content library item." },
        { status: 400 },
      );
    }

    const item: ContentLibraryItem = {
      id: data.id,
      label: data.label ?? "",
      is_active: data.is_active ?? false,
      config: config,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("[content-library/get] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to load content item." },
      { status: 500 },
    );
  }
}

