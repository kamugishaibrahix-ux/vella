import { NextRequest } from "next/server";

import { TOKEN_PACK_PRICE_IDS, type TokenPackId, stripe } from "@/lib/payments/stripe";

import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { stripeTokenPackSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { getValidatedOrigin } from "@/lib/payments/originValidation";
import { isBillingDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

export const runtime = "nodejs";

const RATE_LIMIT_TOKEN_PACK = { limit: 5, window: 60 };
const ROUTE_KEY = "stripe_token_pack";

const BILLING_DISABLED_RESPONSE = { code: "BILLING_DISABLED", message: "Billing is temporarily disabled" };

export async function POST(req: NextRequest) {
  if (isBillingDisabled()) {
    return new Response(JSON.stringify(BILLING_DISABLED_RESPONSE), { status: 503, headers: { "Content-Type": "application/json" } });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `stripe_token_pack:${userId}`,
    limit: RATE_LIMIT_TOKEN_PACK.limit,
    window: RATE_LIMIT_TOKEN_PACK.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  if (!stripe) {
    return new Response(JSON.stringify({ code: "STRIPE_NOT_CONFIGURED", message: "Stripe not configured" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const json = await req.json().catch(() => null);
    const parseResult = stripeTokenPackSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const { packId } = parseResult.data;

  const priceId = TOKEN_PACK_PRICE_IDS[packId];
  if (!priceId) {
    return new Response(JSON.stringify({ code: "MISSING_PRICE", message: "Missing price for pack" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Validate origin to prevent URL poisoning
  const trustedOrigin = getValidatedOrigin(req.headers.get("origin"));

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${trustedOrigin}/settings/account-plan?token-pack=success`,
    cancel_url: `${trustedOrigin}/settings/account-plan?token-pack=cancelled`,
    client_reference_id: userId,
    metadata: {
      user_id: userId,
      supabase_user_id: userId,
      pack_id: packId,
    },
  });

  return Response.json({ url: session.url });
  } catch (err) {
    safeErrorLog("[stripe] token-pack checkout error", err);
    return new Response(JSON.stringify({ code: "CHECKOUT_FAILED", message: "Unable to create checkout session" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

