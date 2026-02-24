/**
 * Integration tests for Stripe checkout hardening.
 * Tests origin validation and prevents URL poisoning.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST as checkoutPOST } from "@/app/api/stripe/create-checkout-session/route";
import { POST as tokenPackPOST } from "@/app/api/stripe/token-pack/route";
import { NextRequest } from "next/server";

// Mock authentication
vi.mock("@/lib/supabase/server-auth", () => ({
  requireUserId: vi.fn().mockResolvedValue("test-user-id"),
}));

// Mock Stripe
vi.mock("@/lib/payments/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test-session" }),
      },
    },
  },
  PLAN_PRICE_IDS: {
    pro: "price_test_pro",
    elite: "price_test_elite",
  },
  TOKEN_PACK_PRICE_IDS: {
    pack_small: "price_test_small",
    pack_medium: "price_test_medium",
    pack_large: "price_test_large",
  },
}));

describe("Stripe Checkout Hardening", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
      ALLOWED_ORIGINS: "https://trusted.com",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("POST /api/stripe/create-checkout-session", () => {
    it("uses trusted origin for success/cancel URLs", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      const req = new NextRequest("http://localhost:3000/api/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "pro" }),
        headers: {
          "Content-Type": "application/json",
          origin: "https://trusted.com",
        },
      });

      await checkoutPOST(req);

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: "https://trusted.com/session?upgrade=success",
          cancel_url: "https://trusted.com/profile?upgrade=cancelled",
        }),
      );
    });

    it("rejects untrusted origin and uses canonical URL", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      const req = new NextRequest("http://localhost:3000/api/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "pro" }),
        headers: {
          "Content-Type": "application/json",
          origin: "https://evil.com",
        },
      });

      await checkoutPOST(req);

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: "https://app.example.com/session?upgrade=success",
          cancel_url: "https://app.example.com/profile?upgrade=cancelled",
        }),
      );
    });

    it("handles missing origin header", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      const req = new NextRequest("http://localhost:3000/api/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "pro" }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      await checkoutPOST(req);

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: "https://app.example.com/session?upgrade=success",
          cancel_url: "https://app.example.com/profile?upgrade=cancelled",
        }),
      );
    });

    it("normalizes origin (removes trailing slash, lowercase)", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      const req = new NextRequest("http://localhost:3000/api/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "pro" }),
        headers: {
          "Content-Type": "application/json",
          origin: "HTTPS://TRUSTED.COM/",
        },
      });

      await checkoutPOST(req);

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: "https://trusted.com/session?upgrade=success",
          cancel_url: "https://trusted.com/profile?upgrade=cancelled",
        }),
      );
    });
  });

  describe("POST /api/stripe/token-pack", () => {
    it("uses trusted origin for success/cancel URLs", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      const req = new NextRequest("http://localhost:3000/api/stripe/token-pack", {
        method: "POST",
        body: JSON.stringify({ packId: "pack_small" }),
        headers: {
          "Content-Type": "application/json",
          origin: "https://trusted.com",
        },
      });

      await tokenPackPOST(req);

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: "https://trusted.com/settings/account-plan?token-pack=success",
          cancel_url: "https://trusted.com/settings/account-plan?token-pack=cancelled",
        }),
      );
    });

    it("rejects untrusted origin and uses canonical URL", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      const req = new NextRequest("http://localhost:3000/api/stripe/token-pack", {
        method: "POST",
        body: JSON.stringify({ packId: "pack_small" }),
        headers: {
          "Content-Type": "application/json",
          origin: "https://evil.com",
        },
      });

      await tokenPackPOST(req);

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: "https://app.example.com/settings/account-plan?token-pack=success",
          cancel_url: "https://app.example.com/settings/account-plan?token-pack=cancelled",
        }),
      );
    });
  });
});
