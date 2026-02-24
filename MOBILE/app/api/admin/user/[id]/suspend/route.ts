/**
 * POST /api/admin/user/:id/suspend
 * Sets suspended flag in admin_user_flags. No free text. Requires admin role (ops_admin or super_admin).
 */

import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin/requireAdminRole";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeUpsert } from "@/lib/safe/safeSupabaseWrite";

const SUSPEND_ALLOWED_ROLES = ["super_admin", "ops_admin"] as const;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRole();
  if (auth instanceof NextResponse) return auth;

  if (!(SUSPEND_ALLOWED_ROLES as readonly string[]).includes(auth.role)) {
    return NextResponse.json(
      { error: "forbidden", code: "INSUFFICIENT_ROLE", message: "suspend requires ops_admin or super_admin" },
      { status: 403 }
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server not configured", code: "SERVER_ERROR" },
      { status: 503 }
    );
  }

  const { id: userId } = await params;
  if (!userId) {
    return NextResponse.json(
      { error: "Missing user id", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  try {
    const { error } = await safeUpsert(
      "admin_user_flags",
      {
        user_id: userId,
        suspended: true,
        suspended_at: now,
        updated_at: now,
      },
      { onConflict: "user_id" },
      supabaseAdmin
    );
    if (error) {
      return NextResponse.json(
        { error: "write_failed", code: "SERVER_ERROR" },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, suspended: true }, { status: 200 });
  } catch (err) {
    console.error("[admin/user/suspend]", err);
    return NextResponse.json(
      { error: "server_error", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
