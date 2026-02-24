import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdminBypassActive } from "@/lib/auth/devBypass";

/**
 * Require admin authentication for API routes.
 * Returns null if authorized, or a NextResponse with error if not.
 *
 * In dev bypass mode (VELLA_BYPASS_ADMIN_AUTH=1), always returns null (authorized)
 * without contacting Supabase.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  // Dev bypass: always succeed without contacting Supabase
  if (isAdminBypassActive()) {
    return null; // Authorized
  }

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const isAdmin = user.user_metadata?.is_admin === true;

    if (!isAdmin) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    return null; // Authorized
  } catch (error) {
    console.error("[requireAdmin] Auth check failed", error);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}

/**
 * Returns the current admin user id when authenticated as admin (for rate-limit keys).
 * Returns "dev-bypass" when dev bypass is active; null when not admin or not authenticated.
 */
export async function getAdminUserId(): Promise<string | null> {
  if (isAdminBypassActive()) {
    return "dev-bypass";
  }
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user || user.user_metadata?.is_admin !== true) {
      return null;
    }
    return user.id;
  } catch {
    return null;
  }
}

