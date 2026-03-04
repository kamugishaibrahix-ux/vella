import { NextResponse } from "next/server";

import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

/**
 * Stripe Sync Endpoint - DISABLED
 * 
 * This endpoint previously existed as a stub that returned fake success.
 * Stubs in admin are dangerous because operators assume they worked.
 * 
 * To implement real Stripe sync:
 * 1. Add Stripe SDK integration
 * 2. Fetch active subscriptions from Stripe
 * 3. Reconcile with local subscriptions table
 * 4. Handle webhooks for state changes
 * 5. Add proper audit logging
 * 
 * Until then, this endpoint returns 501 Not Implemented.
 */
export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "subscriptions-sync-stripe", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  // Return 501 Not Implemented with clear explanation
  return NextResponse.json(
    {
      success: false,
      error: "Stripe sync is not implemented.",
      message: "This feature requires Stripe integration. Contact engineering to enable.",
      required_setup: [
        "Add STRIPE_SECRET_KEY to environment",
        "Add Stripe webhook handler",
        "Create subscription reconciliation logic",
      ],
    },
    { status: 501 }
  );
}
