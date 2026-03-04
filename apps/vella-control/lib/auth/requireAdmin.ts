import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/adminRoles";

/**
 * Require admin authentication for API routes.
 * Returns null if authorized, or a NextResponse with error if not.
 * Uses app_metadata.role (server-authoritative); not user_metadata.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const role = (user.app_metadata as { role?: string } | undefined)?.role;
    if (!isAdminRole(role)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    return null; // Authorized
  } catch (error) {
    console.error("[requireAdmin] Auth check failed", error);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}

/**
 * Returns the current admin user id when authenticated with an admin role (for rate-limit keys).
 * Returns null when not admin or not authenticated.
 * Uses app_metadata.role (server-authoritative); not user_metadata.
 */
export async function getAdminUserId(): Promise<string | null> {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return null;
    }
    const role = (user.app_metadata as { role?: string } | undefined)?.role;
    if (!isAdminRole(role)) {
      return null;
    }
    return user.id;
  } catch {
    return null;
  }
}
