import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  STRIPE_PRICE_IDS,
  TOPUP_TOKENS,
  type TopupSKU,
  getTopupPriceId,
  getTopupTokens,
  isValidTopupSKU,
} from "@/lib/stripe/stripeProducts";
import { stripe } from "@/lib/payments/stripe";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { stripeTopupCheckoutSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { getValidatedOrigin } from "@/lib/payments/originValidation";
import { isBillingDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

export const runtime = "nodejs";

const BILLING_DISABLED_RESPONSE = {
  code: "BILLING_DISABLED",
  message: "Billing is temporarily disabled",
};

const RATE_LIMIT_TOPUP = { limit: 5, window: 60 };

/**
 * POST /api/stripe/topups/create-checkout-session
 * Creates a one-time payment checkout session for token top-ups.
 *
 * Input: { sku: "topup_50k" | "topup_200k" | "topup_1m" }
 *
 * Returns: { url: string } - Stripe Checkout URL
 */
export async function POST(req: NextRequest) {
  // Check billing kill switch
  if (isBillingDisabled()) {
    return NextResponse.json(BILLING_DISABLED_RESPONSE, { status: 503 });
  }

  // Require authenticated user
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  // Rate limiting
  const rateLimitResult = await rateLimit({
    key: `stripe_topup:${userId}`,
    limit: RATE_LIMIT_TOPUP.limit,
    window: RATE_LIMIT_TOPUP.window,
    routeKey: "stripe_topup",
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process checkout.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Stripe availability check
  if (!stripe) {
    return NextResponse.json(
      { code: "STRIPE_NOT_CONFIGURED", message: "Stripe not configured" },
      { status: 500 }
    );
  }

  // Parse and validate request body
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return validationErrorResponse("Invalid JSON body");
  }

  const parseResult = stripeTopupCheckoutSchema.safeParse(json);
  if (!parseResult.success) {
    return validationErrorResponse(formatZodError(parseResult.error));
  }

  const { sku, email } = parseResult.data;

  // Validate SKU is known
  if (!isValidTopupSKU(sku)) {
    return NextResponse.json(
      { code: "INVALID_SKU", message: `Unknown top-up SKU: ${sku}` },
      { status: 400 }
    );
  }

  // Get price ID
  const priceId = getTopupPriceId(sku);
  if (!priceId) {
    return NextResponse.json(
      { code: "MISSING_PRICE", message: `Price not configured for SKU: ${sku}` },
      { status: 500 }
    );
  }

  // Get token amount
  const tokensGranted = getTopupTokens(sku);

  // Validate origin for security
  const trustedOrigin = getValidatedOrigin(req.headers.get("origin"));

  try {
    // Create Stripe Checkout Session (one-time payment mode)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${trustedOrigin}/profile/settings?topup=success`,
      cancel_url: `${trustedOrigin}/profile/settings?topup=cancelled`,
      client_reference_id: userId,
      customer_email: email ?? undefined,
      metadata: {
        user_id: userId,
        supabase_user_id: userId,
        topup_sku: sku,
        tokens_granted: String(tokensGranted),
        type: "token_topup",
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { code: "SESSION_ERROR", message: "Failed to create checkout session URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    safeErrorLog("[stripe-topup] Error creating checkout session", err);
    return NextResponse.json(
      { code: "CHECKOUT_FAILED", message: "Unable to create checkout session" },
      { status: 500 }
    );
  }
}
