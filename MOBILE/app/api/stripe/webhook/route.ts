// Stripe webhook: keeps public.subscriptions in sync with Stripe subscription status and plan.
// Handles: subscription lifecycle, token top-ups, invoice events.
// IDEMPOTENCY: Uses atomic_stripe_webhook_process for all token credit operations.

import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { PLAN_PRICE_IDS, type PlanId, stripe } from "@/lib/payments/stripe";
import { STRIPE_PRICE_IDS, TOPUP_TOKENS, type TopupSKU, isValidTopupSKU } from "@/lib/stripe/stripeProducts";
import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";
import { safeInsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";
import { rateLimit, rateLimit429Response, rateLimit503Response, getClientIp } from "@/lib/security/rateLimit";
import { invalidateSubscriptionPlanCache } from "@/lib/tiers/server";
import { safeErrorLog } from "@/lib/security/logGuard";
import { handlePlanDowngrade, handlePlanUpgrade, detectPlanTransition, type PlanTransitionResult } from "@/lib/plans/downgradePolicy";
import type { PlanTier } from "@/lib/plans/types";
import { isValidPlanTier } from "@/lib/plans/defaultEntitlements";
import { logSecurityEvent } from "@/lib/telemetry/securityEvents";
import { incrementStripeWebhookDuplicate } from "@/lib/security/observability";

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

/** Result from atomic_stripe_webhook_process RPC */
type AtomicWebhookResult = {
  success: boolean;
  already_processed: boolean;
  error: string | null;
  details?: string;
  tokens_previously_awarded?: number;
  tokens_awarded?: number;
  new_balance?: number;
};

const PRICE_TO_PLAN = Object.entries(PLAN_PRICE_IDS).reduce<Record<string, PlanId>>((acc, [plan, priceId]) => {
  if (priceId) {
    acc[priceId] = plan as PlanId;
  }
  return acc;
}, {});

// Legacy token pack mapping (for backward compatibility)
const LEGACY_TOKEN_AMOUNTS: Record<string, number> = {
  pack_small: 5_000,
  pack_medium: 20_000,
  pack_large: 100_000,
};

/** Max webhook body size (256 KB). Reject larger before signature verification. */
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

/**
 * Webhook event types supported and their mutations:
 * | Event Type | Mutation | Idempotent |
 * |------------|----------|------------|
 * | checkout.session.completed (subscription) | Upsert subscription | Yes (atomic) |
 * | checkout.session.completed (payment) | Insert token_topup | Yes (atomic) |
 * | customer.subscription.created | Upsert subscription | Yes (atomic) |
 * | customer.subscription.updated | Upsert subscription + plan transition | Yes (atomic) |
 * | customer.subscription.deleted | Update status → canceled, plan → free | Yes (atomic) |
 * | invoice.payment_succeeded | Update subscription period | Yes (atomic) |
 * | invoice.payment_failed | Mark subscription past_due | Yes (atomic) |
 * | payment_intent.succeeded | Insert token_topup | Yes (atomic) |
 * 
 * IDEMPOTENCY ARCHITECTURE:
 * - All token credit operations use atomic_stripe_webhook_process() DB function
 * - Advisory lock on payment_intent_id serializes concurrent requests
 * - Unique constraints on webhook_events.event_id and token_topups.stripe_payment_intent_id
 * - Exactly-once guarantee: event processed once, tokens credited once per payment
 */

export async function POST(req: NextRequest) {
  // Phase 3.3: Rate limit with explicit policy (FAIL-CLOSED - payment critical)
  const clientIp = getClientIp(req);
  const rateLimitResult = await rateLimit({
    key: `webhook:stripe:${clientIp}`,
    limit: 100,
    window: 60,
    routeKey: "stripe_webhook",
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process payment webhooks.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client missing" }, { status: 500 });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Deploy-safe mode: return 200 with warning instead of crashing
    // This allows deployment before webhook is fully configured
    console.warn("[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured - webhook processing disabled");
    return NextResponse.json(
      { received: true, warning: "webhook_not_configured" },
      { status: 200 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Hard request size limit: reject before reading body if Content-Length > 256KB
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null && contentLength !== undefined) {
    const len = parseInt(contentLength, 10);
    if (!Number.isNaN(len) && len > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json(
        { error: "payload_too_large", message: "Request body exceeds 256KB limit" },
        { status: 413 }
      );
    }
  }

  const body = await req.text();

  if (Buffer.byteLength(body, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json(
      { error: "payload_too_large", message: "Request body exceeds 256KB limit" },
      { status: 413 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    safeErrorLog("[stripe-webhook] signature error", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Process event (handlers are responsible for idempotency)
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSession(event.data.object as Stripe.Checkout.Session, event.id);
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription, event.id);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event.id);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice, event.id);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, event.id);
        break;
      // Legacy: payment_intent.succeeded for token packs (backward compatibility)
      // Uses atomic function for idempotency
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, event.id);
        break;
      default:
        // Unhandled event types are silently ignored
        break;
    }
  } catch (error) {
    safeErrorLog("[stripe-webhook] handler error", error);
    return NextResponse.json({ error: "webhook_error" }, { status: 400 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutSession(session: Stripe.Checkout.Session, eventId: string) {
  const mode = session.mode;

  if (mode === "subscription") {
    await handleSubscriptionCheckout(session, eventId);
  } else if (mode === "payment") {
    await handlePaymentCheckout(session, eventId);
  }
  // Unknown checkout modes are silently ignored
}

async function handleSubscriptionCheckout(session: Stripe.Checkout.Session, eventId: string) {
  // Record event first for idempotency; skip mutations if already processed
  const recorded = await recordStripeEvent(eventId, "checkout.session.completed");
  if (recorded.already_processed) {
    incrementStripeWebhookDuplicate();
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) {
    return;
  }

  const userId = extractUserId(session);
  if (!userId) {
    return;
  }

  const stripeSubscription = await stripe!.subscriptions.retrieve(subscriptionId);
  const customerId = extractCustomerId(stripeSubscription);
  const plan = planFromSubscription(stripeSubscription);
  const payload = buildSubscriptionPayload(stripeSubscription, plan, customerId);

  // Store previous tier for transition detection
  const previousTier = await getCurrentPlanTier(userId);

  // Upsert subscription
  await upsertSubscriptionForUser(userId, payload);

  // Handle plan transition if tier changed
  if (previousTier && previousTier !== plan) {
    await handlePlanTransition(userId, previousTier, plan);
  }
}

async function handlePaymentCheckout(session: Stripe.Checkout.Session, eventId: string) {
  // Handle token top-up checkout (one-time payment)
  const userId = extractUserId(session);
  if (!userId) {
    return;
  }

  const metadata = session.metadata || {};

  // Try new SKU naming first, then legacy pack_id
  const topupSKU = metadata.topup_sku as TopupSKU | undefined;
  const packId = metadata.pack_id;

  let tokensToAward: number | null = null;
  let stripePaymentIntentId: string | null = null;

  if (topupSKU && isValidTopupSKU(topupSKU)) {
    tokensToAward = TOPUP_TOKENS[topupSKU];
    stripePaymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
  } else if (packId && LEGACY_TOKEN_AMOUNTS[packId]) {
    tokensToAward = LEGACY_TOKEN_AMOUNTS[packId];
    stripePaymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
  } else {
    // Unknown top-up identifier - silently ignore
    return;
  }

  if (!tokensToAward) {
    // Could not determine token amount - silently ignore
    return;
  }

  if (!stripePaymentIntentId) {
    // Missing payment_intent - silently ignore
    return;
  }

  // Use atomic function for idempotent token credit
  const amountUsd = session.amount_total ? session.amount_total / 100 : 0;
  const packName = topupSKU || packId || "unknown";
  
  const result = await atomicStripeWebhookProcess(
    eventId,
    "checkout.session.completed",
    stripePaymentIntentId,
    userId,
    tokensToAward,
    amountUsd,
    packName
  );

  if (!result.success) {
    throw new Error(`Atomic webhook process failed: ${result.error}`);
  }
  // Success - tokens processed (already_processed or new credit)
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription, eventId: string) {
  // Record event first for idempotency; skip mutations if already processed
  const recorded = await recordStripeEvent(eventId, "customer.subscription.created");
  if (recorded.already_processed) {
    incrementStripeWebhookDuplicate();
    return;
  }

  const customerId = extractCustomerId(subscription);
  const plan = planFromSubscription(subscription);
  const payload = buildSubscriptionPayload(subscription, plan, customerId);

  if (!customerId) {
    return;
  }

  const { data } = await fromSafe("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  const subscriptionRow = data as Pick<SubscriptionRow, "user_id"> | null;

  if (subscriptionRow?.user_id) {
    await upsertSubscriptionForUser(subscriptionRow.user_id, payload);
  }
  // else: Subscription created without our checkout (e.g., Stripe Dashboard)
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, eventId: string) {
  // Record event first for idempotency; skip mutations if already processed
  const recorded = await recordStripeEvent(eventId, "customer.subscription.updated");
  if (recorded.already_processed) {
    incrementStripeWebhookDuplicate();
    return;
  }

  const customerId = extractCustomerId(subscription);
  const plan = planFromSubscription(subscription);
  const payload = buildSubscriptionPayload(subscription, plan, customerId);

  const { data } = await fromSafe("subscriptions")
    .select("user_id, plan")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  const subscriptionRow = data as Pick<SubscriptionRow, "user_id" | "plan"> | null;
  const userId = subscriptionRow?.user_id;

  const rawPrev = subscriptionRow?.plan as string | null;
  const previousTier: PlanTier | null = rawPrev && isValidPlanTier(rawPrev) ? rawPrev : null;

  if (userId) {
    await upsertSubscriptionForUser(userId, payload);

    if (previousTier && previousTier !== plan) {
      await handlePlanTransition(userId, previousTier, plan);
    }
  } else if (customerId) {
    await upsertSubscriptionByCustomer(customerId, payload);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventId: string) {
  // Record event first for idempotency; skip mutations if already processed
  const recorded = await recordStripeEvent(eventId, "customer.subscription.deleted");
  if (recorded.already_processed) {
    incrementStripeWebhookDuplicate();
    return;
  }

  if (!supabaseAdmin) return;

  const { data } = await fromSafe("subscriptions")
    .select("user_id, plan")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  const subscriptionRow = data as Pick<SubscriptionRow, "user_id" | "plan"> | null;
  const userId = subscriptionRow?.user_id;
  const rawPrev = subscriptionRow?.plan as string | null;
  const previousTier: PlanTier | null = rawPrev && isValidPlanTier(rawPrev) ? rawPrev : null;

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
    true // bypass write lock: webhook must persist subscription state
  ).eq("stripe_subscription_id", subscription.id);

  if (error) {
    safeErrorLog("[stripe-webhook] delete update error", error);
  }

  if (userId && previousTier && previousTier !== "free") {
    await handlePlanTransition(userId, previousTier, "free");
  }

  if (userId) await invalidateSubscriptionPlanCache(userId);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice, eventId: string) {
  if (!invoice.subscription || !supabaseAdmin) return;

  // Record event first for idempotency; skip mutations if already processed
  const recorded = await recordStripeEvent(eventId, "invoice.payment_succeeded");
  if (recorded.already_processed) {
    incrementStripeWebhookDuplicate();
    return;
  }

  const subscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription.id;

  const { error } = await safeUpdate(
    "subscriptions",
    {
      current_period_start: toIso(invoice.period_start),
      current_period_end: toIso(invoice.period_end),
      status: "active",
    },
    undefined,
    supabaseAdmin,
    true
  ).eq("stripe_subscription_id", subscriptionId);

  if (error) {
    safeErrorLog("[stripe-webhook] invoice payment succeeded update error", error);
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, eventId: string) {
  if (!invoice.subscription || !supabaseAdmin) return;

  // Record event first for idempotency; skip mutations if already processed
  const recorded = await recordStripeEvent(eventId, "invoice.payment_failed");
  if (recorded.already_processed) {
    incrementStripeWebhookDuplicate();
    return;
  }

  const subscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription.id;

  const { error } = await safeUpdate(
    "subscriptions",
    {
      status: "past_due",
    },
    undefined,
    supabaseAdmin,
    true
  ).eq("stripe_subscription_id", subscriptionId);

  if (error) {
    safeErrorLog("[stripe-webhook] invoice payment failed update error", error);
  }
}

// Legacy handler for backward compatibility
// Uses atomic function for idempotent token credit
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent, eventId: string) {
  try {
    const userId = extractUserIdFromPaymentIntent(paymentIntent);
    if (!userId) {
      return;
    }

    const packId = paymentIntent.metadata?.pack_id;
    const topupSKU = paymentIntent.metadata?.topup_sku as TopupSKU | undefined;

    let tokensToAward: number | null = null;

    if (topupSKU && isValidTopupSKU(topupSKU)) {
      tokensToAward = TOPUP_TOKENS[topupSKU];
    } else if (packId && LEGACY_TOKEN_AMOUNTS[packId]) {
      tokensToAward = LEGACY_TOKEN_AMOUNTS[packId];
    } else {
      return;
    }

    if (!tokensToAward) {
      return;
    }

    // Use atomic function for idempotent token credit
    const amountUsd = paymentIntent.amount_received ? paymentIntent.amount_received / 100 : 0;
    const packName = topupSKU || packId || "unknown";

    const result = await atomicStripeWebhookProcess(
      eventId,
      "payment_intent.succeeded",
      paymentIntent.id,
      userId,
      tokensToAward,
      amountUsd,
      packName
    );

    if (!result.success) {
      throw new Error(`Atomic webhook process failed: ${result.error}`);
    }
    // Success - tokens processed (already_processed or new credit)
  } catch (error) {
    safeErrorLog("[stripe-webhook] failed to process payment_intent.succeeded", error);
    throw error;
  }
}

/**
 * Atomic Stripe webhook processor using DB function.
 * Guarantees exactly-once event processing and exactly-once token credit.
 */
async function atomicStripeWebhookProcess(
  eventId: string,
  eventType: string,
  paymentIntentId: string,
  userId: string,
  tokensToAward: number,
  amountUsd: number,
  packName: string
): Promise<AtomicWebhookResult> {
  if (!supabaseAdmin) {
    return { success: false, already_processed: false, error: "supabase_admin_unavailable" };
  }

  try {
    const { data, error } = await (supabaseAdmin as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    }).rpc("atomic_stripe_webhook_process", {
      p_event_id: eventId,
      p_event_type: eventType,
      p_payment_intent_id: paymentIntentId,
      p_user_id: userId,
      p_tokens_to_award: tokensToAward,
      p_amount_usd: amountUsd,
      p_pack_name: packName,
    });

    if (error) {
      return { success: false, already_processed: false, error: error.message };
    }

    return data as AtomicWebhookResult;
  } catch (error) {
    return {
      success: false,
      already_processed: false,
      error: error instanceof Error ? error.message : "unknown_error"
    };
  }
}

/**
 * Record Stripe event as processed (for non-token-credit events).
 * Uses atomic_stripe_event_record for idempotency.
 * Call first; if already_processed, return early and skip DB mutations.
 */
type RecordStripeEventResult = { success: boolean; already_processed: boolean };

async function recordStripeEvent(eventId: string, eventType: string): Promise<RecordStripeEventResult> {
  if (!supabaseAdmin) {
    return { success: false, already_processed: false };
  }

  try {
    const { data, error } = await (supabaseAdmin as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    }).rpc("atomic_stripe_event_record", {
      p_event_id: eventId,
      p_event_type: eventType,
    });

    if (error) {
      return { success: false, already_processed: false };
    }

    const result = data as { success: boolean; already_processed: boolean; error: string | null };
    return { success: result.success, already_processed: result.already_processed ?? false };
  } catch (error) {
    return { success: false, already_processed: false };
  }
}

/**
 * Handle plan transition by calling appropriate handler.
 */
async function handlePlanTransition(userId: string, fromTier: PlanTier, toTier: PlanTier) {
  const transition = detectPlanTransition(fromTier, toTier);

  let result: PlanTransitionResult;

  if (transition.type === "downgrade") {
    result = await handlePlanDowngrade(userId, fromTier, toTier);
  } else if (transition.type === "upgrade") {
    result = await handlePlanUpgrade(userId, fromTier, toTier);
  } else {
    return; // No transition
  }

  if (!result.success) {
    safeErrorLog(
      `[stripe-webhook] Plan ${transition.type} handler failed`,
      result.error
    );
  }
}

/**
 * Get current plan tier for user.
 */
async function getCurrentPlanTier(userId: string): Promise<PlanTier | null> {
  const { data } = await fromSafe("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();

  const raw = (data as { plan: string | null } | null)?.plan ?? null;
  if (!raw) return null;
  if (!isValidPlanTier(raw)) {
    logSecurityEvent("TIER_CORRUPTION", { user_id: userId, raw_plan: raw, source: "getCurrentPlanTier" });
    return null;
  }
  return raw;
}

function planFromSubscription(subscription: Stripe.Subscription): PlanId {
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return "free";
  const mapped = PRICE_TO_PLAN[priceId];
  if (!mapped) {
    logSecurityEvent("STRIPE_WEBHOOK_INVALID_TIER", {
      subscription_id: subscription.id,
      price_id: priceId,
      reason: "unmapped_price_id",
    });
    throw new Error(`[STRIPE_WEBHOOK] Unmapped price ID "${priceId}" – refusing to write unknown tier to DB`);
  }
  if (!isValidPlanTier(mapped)) {
    logSecurityEvent("STRIPE_WEBHOOK_INVALID_TIER", {
      subscription_id: subscription.id,
      price_id: priceId,
      mapped_plan: mapped,
      reason: "invalid_tier_after_mapping",
    });
    throw new Error(`[STRIPE_WEBHOOK] Mapped plan "${mapped}" is not a valid tier`);
  }
  return mapped;
}

function buildSubscriptionPayload(
  subscription: Stripe.Subscription,
  plan: PlanId,
  customerId: string | null
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

function extractUserId(session: Stripe.Checkout.Session): string | null {
  return (
    session.client_reference_id ??
    session.metadata?.user_id ??
    session.metadata?.supabase_user_id ??
    null
  );
}

function extractUserIdFromPaymentIntent(paymentIntent: Stripe.PaymentIntent): string | null {
  return (
    paymentIntent.metadata?.user_id ??
    paymentIntent.metadata?.supabase_user_id ??
    paymentIntent.metadata?.client_reference_id ??
    null
  );
}

function extractCustomerId(subscription: Stripe.Subscription): string | null {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id ?? null;
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
      userId
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
      true // bypass write lock: webhook must persist subscription state
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
