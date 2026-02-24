import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import type { ContentLibraryItem } from "@/lib/admin/contentLibrary";

const CONTENT_TYPES = ["persona", "script", "template", "story", "habit", "emotion"];

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "content-library-list", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();

    // Fetch all admin_ai_config rows
    const { data, error } = await supabase
      .from("admin_ai_config")
      .select("id, label, config, is_active, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Filter rows that have config.type matching content types
    const contentItems: ContentLibraryItem[] = (data ?? [])
      .filter((row) => {
        if (!row.config || typeof row.config !== "object") return false;
        const config = row.config as any;
        return config.type && CONTENT_TYPES.includes(config.type);
      })
      .map((row) => ({
        id: row.id,
        label: row.label ?? "",
        is_active: row.is_active ?? false,
        config: row.config as any,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

    return NextResponse.json({ success: true, data: contentItems });
  } catch (error) {
    console.error("[content-library/list] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to load content library." },
      { status: 500 },
    );
  }
}

