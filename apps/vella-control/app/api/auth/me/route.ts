import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { getAdminUserId } from "@/lib/auth/requireAdmin";
import { isAdminRole } from "@/lib/auth/adminRoles";

export async function GET(request: Request) {
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "auth-me", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    throw err;
  }

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }

    const role = (user.app_metadata as { role?: string } | undefined)?.role;
    const isAdmin = isAdminRole(role);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: isAdmin ? role : null,
      },
    });
  } catch (error) {
    console.error("[api/auth/me] Error", error);
    return NextResponse.json({ success: false, user: null }, { status: 500 });
  }
}
