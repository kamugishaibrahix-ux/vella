import { NextResponse } from "next/server";
import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";
import { safeDbCall, isDbUnavailableError, dbUnavailableResponse } from "@/lib/server/safeDbCall";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";

const RATE_LIMIT_EXPORT = { limit: 5, window: 300 };
const ROUTE_KEY = "account_export";

export async function POST(request: Request) {
  try {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client not configured." }, { status: 500 });
  }

  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `account_export:${userId}`,
    limit: RATE_LIMIT_EXPORT.limit,
    window: RATE_LIMIT_EXPORT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response();
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  const [profile, subscriptions, vella, preferences, usage, topups] = await safeDbCall(
    () =>
      Promise.all([
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
      ]),
    { route: "account_export", operation: "export" },
  );

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
  } catch (e) {
    if (isDbUnavailableError(e)) return dbUnavailableResponse();
    throw e;
  }
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


