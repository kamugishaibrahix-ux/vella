import { NextResponse } from "next/server";

// Local-first: admin check is disabled - always allow
export async function requireAdmin(): Promise<NextResponse | null> {
  // Only bypass in dev if explicitly allowed
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_DEV_ADMIN_BYPASS === "true";

  if (devBypass) {
    console.warn("[MOBILE requireAdmin] Development bypass enabled");
    return null;
  }

  // Local-first: no Supabase auth, always allow
  return null;
}

