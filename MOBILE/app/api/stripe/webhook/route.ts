// Stripe webhook: keeps public.subscriptions in sync with Stripe subscription status and plan.

import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { PLAN_PRICE_IDS, type PlanId, stripe } from "@/lib/payments/stripe";
import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";
import { safeInsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";
import { isEventProcessed, markEventProcessed } from "@/lib/payments/webhookIdempotency";
import { rateLimit, isRateLimitError, rateLimit429Response, getClientIp } from "@/lib/security/rateLimit";
import { invalidateSubscriptionPlanCache } from "@/lib/tiers/server";
import { safeErrorLog } from "@/lib/security/logGuard";

export const runtime = "nodejs";

type SubscriptionPayload = {
  plan: PlanId;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
};

type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

const PRICE_TO_PLAN = Object.entries(PLAN_PRICE_IDS).reduce<Record<string, PlanId>>((acc, [plan, priceId]) => {
  if (priceId) {
    acc[priceId] = plan as PlanId;
  }
  return acc;
}, {});

export async function POST(req: NextRequest) {
  // Apply lenient IP-based rate limiting to prevent abuse
  try {
    const clientIp = getClientIp(req);
    await rateLimit({ key: `webhook:stripe:${clientIp}`, limit: 100, window: 60 });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
  }

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client missing" }, { status: 500 });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret missing" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    safeErrorLog("[stripe-webhook] signature error", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency check: prevent double-processing
  const alreadyProcessed = await isEventProcessed(event.id);
  if (alreadyProcessed) {
    console.log(`[stripe-webhook] Event ${event.id} already processed, skipping`);
    return NextResponse.json({ received: true, skipped: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      default:
        break;
    }

    // Mark event as processed after successful handling
    const markResult = await markEventProcessed(event.id, event.type);
    if (!markResult.success) {
      safeErrorLog("[stripe-webhook] Failed to mark event as processed", markResult.error);
      // Still return success since we processed the event - this is just a tracking issue
    }
  } catch (error) {
    safeErrorLog("[stripe-webhook] handler error", error);
    return NextResponse.json({ error: "webhook_error" }, { status: 400 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutSession(session: Stripe.Checkout.Session) {
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) {
    console.warn("[stripe-webhook] checkout session missing subscription", session.id);
    return;
  }

  const userId =
    session.client_reference_id ??
    session.metadata?.user_id ??
    session.metadata?.supabase_user_id ??
    null;

  const stripeSubscription = await stripe!.subscriptions.retrieve(subscriptionId);
  const customerId =
    typeof stripeSubscription.customer === "string"
      ? stripeSubscription.customer
      : stripeSubscription.customer?.id ?? null;
  const plan = planFromSubscription(stripeSubscription);
  const payload = buildSubscriptionPayload(stripeSubscription, plan, customerId);

  if (userId) {
    await upsertSubscriptionForUser(userId, payload);
  } else if (customerId) {
    await upsertSubscriptionByCustomer(customerId, payload);
  } else {
    console.warn("[stripe-webhook] Unable to associate checkout session with user", session.id);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;
  const plan = planFromSubscription(subscription);
  const payload = buildSubscriptionPayload(subscription, plan, customerId);
  const { data } = await fromSafe("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  const subscriptionRow = data as Pick<SubscriptionRow, "user_id"> | null;

  if (subscriptionRow?.user_id) {
    await upsertSubscriptionForUser(subscriptionRow.user_id, payload);
  } else if (customerId) {
    await upsertSubscriptionByCustomer(customerId, payload);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  if (!supabaseAdmin) return;
  const { data } = await fromSafe("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  const userId = (data as Pick<SubscriptionRow, "user_id"> | null)?.user_id;

  const { error } = await safeUpdate(
    "subscriptions",
    {
      status: subscription.status ?? "canceled",
      plan: "free",
      current_period_start: toIso(subscription.current_period_start),
      current_period_end: toIso(subscription.current_period_end),
    },
    undefined,
    supabaseAdmin,
    true, // bypass write lock: webhook must persist subscription state
  ).eq("stripe_subscription_id", subscription.id);

  if (error) {
    safeErrorLog("[stripe-webhook] delete update error", error);
  }
  if (userId) await invalidateSubscriptionPlanCache(userId);
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  try {
    const userId =
      paymentIntent.metadata?.user_id ??
      paymentIntent.metadata?.supabase_user_id ??
      paymentIntent.metadata?.client_reference_id;

    if (!userId) {
      console.error("[stripe-webhook] payment intent missing user metadata", paymentIntent.id);
      return;
    }

    const packId = paymentIntent.metadata?.pack_id;
    if (!packId) {
      console.error("[stripe-webhook] payment intent missing pack_id metadata", paymentIntent.id);
      return;
    }

    // Token amounts based on your UI definitions
    const TOKEN_AMOUNTS: Record<string, number> = {
      pack_small: 5000,
      pack_medium: 20000,
      pack_large: 100000,
    };

    const tokensToAward = TOKEN_AMOUNTS[packId];
    if (!tokensToAward) {
      console.error("[stripe-webhook] invalid pack_id in payment intent", packId);
      return;
    }

    if (!supabaseAdmin) {
      console.error("[stripe-webhook] supabaseAdmin not available");
      return;
    }

    // Insert record into token_topups table
    const { error: insertError } = await safeInsert(
      "token_topups",
      {
        user_id: userId,
        amount: paymentIntent.amount_received ? paymentIntent.amount_received / 100 : 0,
        tokens: tokensToAward,
        stripe_payment_intent_id: paymentIntent.id,
      },
      undefined,
      supabaseAdmin,
      true, // bypass write lock: webhook must persist subscription/token state
    );

    if (insertError) {
      safeErrorLog("[stripe-webhook] failed to insert token_topup", insertError);
      return;
    }

    // Update subscriptions.token_balance
    // First, get current subscription to read current token_balance
    const { data: subscriptionData } = await fromSafe("subscriptions")
      .select("token_balance")
      .eq("user_id", userId)
      .maybeSingle();

    const currentBalance = (subscriptionData as { token_balance?: number | null } | null)?.token_balance ?? 0;
    const newBalance = currentBalance + tokensToAward;

    const { error: updateError } = await safeUpdate(
      "subscriptions",
      {
        token_balance: newBalance,
      },
      undefined,
      supabaseAdmin,
      true, // bypass write lock: webhook must persist subscription/token state
    ).eq("user_id", userId);

    if (updateError) {
      safeErrorLog("[stripe-webhook] failed to update token_balance", updateError);
    }
  } catch (error) {
    safeErrorLog("[stripe-webhook] failed to process payment_intent.succeeded", error);
  }
}

function planFromSubscription(subscription: Stripe.Subscription): PlanId {
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return "free";
  return PRICE_TO_PLAN[priceId] ?? "free";
}

function buildSubscriptionPayload(
  subscription: Stripe.Subscription,
  plan: PlanId,
  customerId: string | null,
): SubscriptionPayload {
  return {
    plan,
    status: subscription.status ?? "active",
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    current_period_start: toIso(subscription.current_period_start),
    current_period_end: toIso(subscription.current_period_end),
  };
}

async function upsertSubscriptionForUser(userId: string, payload: SubscriptionPayload) {
  const { data } = await fromSafe("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const existing = data as Pick<SubscriptionRow, "id"> | null;

  if (existing?.id) {
    if (!supabaseAdmin) return;
    const { error } = await safeUpdate("subscriptions", payload, undefined, supabaseAdmin, true).eq(
      "user_id",
      userId,
    );
    if (error) {
      safeErrorLog("[stripe-webhook] update error", error);
    }
  } else {
    if (!supabaseAdmin) return;
    const { error } = await safeInsert(
      "subscriptions",
      { user_id: userId, ...payload },
      undefined,
      supabaseAdmin,
      true, // bypass write lock: webhook must persist subscription state
    );
    if (error) {
      safeErrorLog("[stripe-webhook] insert error", error);
    }
  }
  await invalidateSubscriptionPlanCache(userId);
}

async function upsertSubscriptionByCustomer(customerId: string, payload: SubscriptionPayload) {
  const { data } = await fromSafe("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  const subscriptionRow = data as Pick<SubscriptionRow, "user_id"> | null;

  if (subscriptionRow?.user_id) {
    await upsertSubscriptionForUser(subscriptionRow.user_id, payload);
  }
}

function toIso(timestamp?: number | null): string | null {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString();
}

