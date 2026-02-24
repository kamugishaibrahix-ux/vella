import { NextResponse } from "next/server";
import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const RATE_LIMIT_EXPORT = { limit: 5, window: 300 };

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client not configured." }, { status: 500 });
  }

  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `account_export:${userId}`, limit: RATE_LIMIT_EXPORT.limit, window: RATE_LIMIT_EXPORT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    throw err;
  }

  const [profile, subscriptions, vella, preferences, usage, topups] = await Promise.all([
    fromSafe("profiles")
      .select("id, display_name, created_at, avatar_url")
      .eq("id", userId)
      .maybeSingle(),
    fromSafe("subscriptions")
      .select("id, user_id, plan, monthly_token_allocation, created_at")
      .eq("user_id", userId),
    fromSafe("vella_settings")
      .select("user_id, voice_model, tone_style, relationship_mode, voice_hud")
      .eq("user_id", userId)
      .maybeSingle(),
    fromSafe("user_preferences")
      .select("user_id, notifications_enabled, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
    fromSafe("token_usage")
      .select("id, user_id, tokens, from_allocation, created_at")
      .eq("user_id", userId)
      .limit(200),
    fromSafe("token_topups")
      .select("id, user_id, amount, created_at, purchased")
      .eq("user_id", userId)
      .limit(200),
  ]);

  const profileData = unwrapResponse<Record<string, unknown> | null>(profile, "profiles", null);
  const subscriptionsData = unwrapResponse<any[]>(subscriptions, "subscriptions", []);
  const vellaData = unwrapResponse<Record<string, unknown> | null>(vella, "vella_settings", null);
  const preferencesData = unwrapResponse<Record<string, unknown> | null>(preferences, "user_preferences", null);
  const usageData = unwrapResponse<any[]>(usage, "token_usage", []);
  const topupsData = unwrapResponse<any[]>(topups, "token_topups", []);

  const payload = {
    profile: profileData,
    subscriptions: subscriptionsData,
    vellaSettings: vellaData,
    preferences: preferencesData,
    tokenUsage: usageData,
    tokenTopups: topupsData,
    exportedAt: new Date().toISOString(),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="vella-account-${userId}.json"`,
    },
  });
}

function unwrapResponse<T>(
  response: { data: T | null; error: { code?: string; message: string } | null },
  _table: string,
  fallback: T | null,
) {
  if (response.error) {
    return fallback;
  }
  return response.data ?? fallback;
}


