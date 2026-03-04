import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminLoginSchema } from "@/lib/validators/adminLoginSchema";
import {
  getClientIp,
  rateLimit,
  isRateLimitError,
  rateLimit429Response,
} from "@/lib/security/rateLimit";
import { isAdminRole } from "@/lib/auth/adminRoles";

/** IP-based rate limit: 5 attempts per 5 minutes per IP to mitigate brute force. */
const LOGIN_RATE_LIMIT = { limit: 5, windowSeconds: 300 };

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    await rateLimit(`ip:auth:login:${ip}`, LOGIN_RATE_LIMIT.limit, LOGIN_RATE_LIMIT.windowSeconds);
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.join(".")}: ${first.message}` : "Invalid request";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  const { email, password } = parsed.data;

  try {
    const supabase = createServerSupabaseClient();

    const {
      data: { user },
      error: signInError,
    } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !user) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const role = (user.app_metadata as { role?: string } | undefined)?.role;
    if (!isAdminRole(role)) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { success: false, error: "Access denied. Admin privileges required." },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/auth/login] Error", error);
    return NextResponse.json(
      { success: false, error: "Login failed. Please try again." },
      { status: 500 }
    );
  }
}
