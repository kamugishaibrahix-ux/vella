import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdminBypassActive } from "@/lib/auth/devBypass";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { getAdminUserId } from "@/lib/auth/requireAdmin";

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

  // Dev bypass: return fake admin user if bypass is active
  if (isAdminBypassActive()) {
    return NextResponse.json(
      {
        success: true,
        user: {
          id: "dev-admin",
          email: "dev-admin@example.com",
          is_admin: true,
          name: "Dev Admin",
        },
      },
      { status: 200 }
    );
  }

  // Production or dev without bypass: use real Supabase auth
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        is_admin: user.user_metadata?.is_admin === true,
      },
    });
  } catch (error) {
    console.error("[api/auth/me] Error", error);
    return NextResponse.json({ success: false, user: null }, { status: 500 });
  }
}

