import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.warn("[stripe] STRIPE_SECRET_KEY not set – Stripe APIs will fail");
}

export const stripe =
  secretKey != null && secretKey !== ""
    ? new Stripe(secretKey, {
        apiVersion: "2024-06-20",
      })
    : null;

export type PlanId = "free" | "pro" | "elite";

export const PLAN_PRICE_IDS: Record<PlanId, string | undefined> = {
  free: undefined,
  pro: process.env.STRIPE_PRICE_PRO,
  elite: process.env.STRIPE_PRICE_ELITE,
};

export type TokenPackId = "pack_small" | "pack_medium" | "pack_large";

export const TOKEN_PACK_PRICE_IDS: Record<TokenPackId, string | undefined> = {
  pack_small: process.env.STRIPE_PRICE_PACK_SMALL,
  pack_medium: process.env.STRIPE_PRICE_PACK_MEDIUM,
  pack_large: process.env.STRIPE_PRICE_PACK_LARGE,
};

