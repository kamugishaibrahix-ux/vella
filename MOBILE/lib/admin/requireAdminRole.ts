/**
 * Admin API: require JWT app_metadata.role to be one of the contract admin roles.
 * Returns 403 if not admin. No fallback.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const ADMIN_ROLES = [
  "super_admin",
  "ops_admin",
  "analyst",
  "support_agent",
  "read_only",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

const FORBIDDEN_RESPONSE = NextResponse.json(
  { error: "forbidden", code: "ADMIN_REQUIRED", message: "Admin role required" },
  { status: 403 }
);

/**
 * Require authenticated user with admin role (app_metadata.role).
 * Returns { userId, role } or 401/403 NextResponse.
 */
export async function requireAdminRole(): Promise<
  | { userId: string; role: AdminRole }
  | NextResponse
> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: "unauthorized", code: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = user.id;
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "unauthorized", code: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 }
      );
    }

    const role = (user.app_metadata as { role?: string } | undefined)?.role;
    if (!isAdminRole(role)) {
      return FORBIDDEN_RESPONSE;
    }

    return { userId, role };
  } catch (err) {
    console.error("[admin-auth] requireAdminRole failed:", err);
    return FORBIDDEN_RESPONSE;
  }
}
