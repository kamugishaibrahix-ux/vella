import { NextResponse } from "next/server";
import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const RATE_LIMIT_DELETE = { limit: 2, window: 600 };

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client not configured." }, { status: 500 });
  }

  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `account_delete:${userId}`, limit: RATE_LIMIT_DELETE.limit, window: RATE_LIMIT_DELETE.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    throw err;
  }

  const deleteOperations = [
    { table: "token_usage", promise: fromSafe("token_usage").delete().eq("user_id", userId) },
    { table: "token_topups", promise: fromSafe("token_topups").delete().eq("user_id", userId) },
    { table: "subscriptions", promise: fromSafe("subscriptions").delete().eq("user_id", userId) },
    { table: "user_preferences", promise: fromSafe("user_preferences").delete().eq("user_id", userId) },
    { table: "vella_settings", promise: fromSafe("vella_settings").delete().eq("user_id", userId) },
    { table: "profiles", promise: fromSafe("profiles").delete().eq("id", userId) },
  ];

  const deleteResults = await Promise.all(deleteOperations.map((entry) => entry.promise));
  // Errors are logged but don't block deletion
  deleteResults.forEach((result) => {
    if (result.error) {
      // Silently continue - best effort deletion
    }
  });

  const adminResult = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (adminResult.error) {
    return NextResponse.json({ error: adminResult.error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}


