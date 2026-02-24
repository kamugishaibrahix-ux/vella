import { NextRequest } from "next/server";
import { PLAN_PRICE_IDS, type PlanId, stripe } from "@/lib/payments/stripe";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { stripeCheckoutSessionSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { getValidatedOrigin } from "@/lib/payments/originValidation";
import { isBillingDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

export const runtime = "nodejs";

const BILLING_DISABLED_RESPONSE = { code: "BILLING_DISABLED", message: "Billing is temporarily disabled" };

const RATE_LIMIT_CHECKOUT = { limit: 5, window: 60 };

export async function POST(req: NextRequest) {
  if (isBillingDisabled()) {
    return new Response(JSON.stringify(BILLING_DISABLED_RESPONSE), { status: 503, headers: { "Content-Type": "application/json" } });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `stripe_checkout:${userId}`, limit: RATE_LIMIT_CHECKOUT.limit, window: RATE_LIMIT_CHECKOUT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    throw err;
  }

  if (!stripe) {
    return new Response(JSON.stringify({ code: "STRIPE_NOT_CONFIGURED", message: "Stripe not configured" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const json = await req.json().catch(() => null);
    const parseResult = stripeCheckoutSessionSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const { plan, email } = parseResult.data;

  const priceId = PLAN_PRICE_IDS[plan];
  if (!priceId) {
    return new Response(JSON.stringify({ code: "MISSING_PRICE", message: "Missing price for plan" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Validate origin to prevent URL poisoning
  const trustedOrigin = getValidatedOrigin(req.headers.get("origin"));

  const session = await stripe.checkout.sessions.create({
    client_reference_id: userId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${trustedOrigin}/session?upgrade=success`,
    cancel_url: `${trustedOrigin}/profile?upgrade=cancelled`,
    customer_email: email ?? undefined,
    metadata: {
      user_id: userId,
      supabase_user_id: userId,
    },
  });

  return Response.json({ url: session.url });
  } catch (err) {
    safeErrorLog("[stripe] create-checkout-session error", err);
    return new Response(JSON.stringify({ code: "CHECKOUT_FAILED", message: "Unable to create checkout session" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

