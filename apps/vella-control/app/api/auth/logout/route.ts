import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { getAdminUserId } from "@/lib/auth/requireAdmin";

export async function POST(request: Request) {
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "auth-logout", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    throw err;
  }

  try {
    const supabase = createServerSupabaseClient();
    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/auth/logout] Error", error);
    // Even if signOut fails, return success to allow client-side cleanup
    return NextResponse.json({ success: true });
  }
}

