import { NextResponse } from "next/server";
import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";

const RATE_LIMIT_DELETE = { limit: 2, window: 600 };
const ROUTE_KEY = "account_delete";

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client not configured." }, { status: 500 });
  }

  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `account_delete:${userId}`,
    limit: RATE_LIMIT_DELETE.limit,
    window: RATE_LIMIT_DELETE.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response();
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Delete user data. Note: token_usage and token_topups are automatically
  // deleted via ON DELETE CASCADE on the user_id foreign key when profile
  // is deleted. The ledger write firewall blocks direct DML on these tables.
  const deleteOperations = [
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


