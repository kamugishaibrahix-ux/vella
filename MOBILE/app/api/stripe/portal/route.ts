import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/payments/stripe";
import { requireUserId } from "@/lib/supabase/server-auth";
import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";
import { getValidatedOrigin } from "@/lib/payments/originValidation";
import { notFoundResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { isBillingDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

export const runtime = "nodejs";

const BILLING_DISABLED_RESPONSE = { code: "BILLING_DISABLED", message: "Billing is temporarily disabled" };

/** Allowed return path suffixes for Stripe billing portal. Prevents open redirect. */
const ALLOWED_RETURN_PATHS = ["/profile", "/settings", "/settings/account-plan"] as const;
const DEFAULT_RETURN_PATH = "/profile";

function resolveReturnPath(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.includes("//")) {
    return DEFAULT_RETURN_PATH;
  }
  const trimmed = raw.trim();
  const pathOnly = trimmed.split("?")[0].split("#")[0].trim().toLowerCase();
  const allowed = ALLOWED_RETURN_PATHS.some((p) => pathOnly === p);
  return allowed ? trimmed : DEFAULT_RETURN_PATH;
}

/**
 * Billing portal is bound to the authenticated user only. We never trust
 * client-supplied Stripe customer IDs; the server resolves the user's
 * stripe_customer_id from storage.
 */
const RATE_LIMIT_PORTAL = { limit: 5, window: 60 };

export async function POST(req: NextRequest) {
  if (isBillingDisabled()) {
    return NextResponse.json(BILLING_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `stripe_portal:${userId}`, limit: RATE_LIMIT_PORTAL.limit, window: RATE_LIMIT_PORTAL.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    throw err;
  }

  if (!stripe) {
    return serverErrorResponse("Stripe not configured");
  }
  if (!supabaseAdmin) {
    return serverErrorResponse("Server configuration error");
  }

  let returnPath = DEFAULT_RETURN_PATH;
  try {
    const body = (await req.json().catch(() => null)) as { returnPath?: unknown } | null;
    if (body?.returnPath != null) {
      returnPath = resolveReturnPath(body.returnPath);
    }
  } catch {
    // Ignore body parse failure; use default return path
  }

  const { data: row, error } = await fromSafe("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    safeErrorLog("[stripe] portal subscription lookup error", error);
    return serverErrorResponse();
  }

  const customerId = (row as { stripe_customer_id?: string | null } | null)?.stripe_customer_id?.trim();
  if (!customerId) {
    return notFoundResponse("No billing account found for this user.");
  }

  const origin = getValidatedOrigin(req.headers.get("origin"));
  const returnUrl = `${origin}${returnPath}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    safeErrorLog("[stripe] portal error", err);
    return serverErrorResponse("Unable to create portal session");
  }
}
