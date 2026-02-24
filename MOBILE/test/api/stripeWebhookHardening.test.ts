/**
 * Integration tests for Stripe webhook hardening.
 * Tests idempotency, rate limiting, and signature verification.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST as webhookPOST } from "@/app/api/stripe/webhook/route";
import { NextRequest } from "next/server";

// Mock Stripe
vi.mock("@/lib/payments/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        customer: "cus_test",
        items: { data: [{ price: { id: "price_test_pro" } }] },
        status: "active",
        current_period_start: 1609459200,
        current_period_end: 1612137600,
      }),
    },
  },
  PLAN_PRICE_IDS: {
    pro: "price_test_pro",
    elite: "price_test_elite",
  },
}));

// Mock Supabase
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
  fromSafe: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
  }),
}));

// Mock safe writes
vi.mock("@/lib/safe/safeSupabaseWrite", () => ({
  safeInsert: vi.fn().mockResolvedValue({ error: null }),
  safeUpdate: vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

// Mock idempotency
vi.mock("@/lib/payments/webhookIdempotency", () => ({
  isEventProcessed: vi.fn(),
  markEventProcessed: vi.fn(),
}));

// Mock rate limiting
vi.mock("@/lib/security/rateLimit", () => ({
  rateLimit: vi.fn().mockResolvedValue(undefined),
  isRateLimitError: vi.fn().mockReturnValue(false),
  rateLimit429Response: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

describe("Stripe Webhook Hardening", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
    };
    const { isEventProcessed, markEventProcessed } = await import("@/lib/payments/webhookIdempotency");
    vi.mocked(isEventProcessed).mockResolvedValue(false);
    vi.mocked(markEventProcessed).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Idempotency", () => {
    it("processes event when not previously seen", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      const { isEventProcessed, markEventProcessed } = await import("@/lib/payments/webhookIdempotency");
      
      const mockEvent = {
        id: "evt_test_123",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test",
            subscription: "sub_test",
            client_reference_id: "user_test",
            metadata: {},
          },
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any);
      vi.mocked(isEventProcessed).mockResolvedValue(false);

      const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(mockEvent),
        headers: {
          "stripe-signature": "t=1234567890,v1=signature",
        },
      });

      const response = await webhookPOST(req);
      const json = await response.json();

      expect(isEventProcessed).toHaveBeenCalledWith("evt_test_123");
      expect(markEventProcessed).toHaveBeenCalledWith("evt_test_123", "checkout.session.completed");
      expect(json.received).toBe(true);
      expect(json.skipped).toBeUndefined();
    });

    it("skips processing when event already processed", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      const { isEventProcessed, markEventProcessed } = await import("@/lib/payments/webhookIdempotency");
      
      const mockEvent = {
        id: "evt_test_456",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test",
            subscription: "sub_test",
          },
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any);
      vi.mocked(isEventProcessed).mockResolvedValue(true); // Already processed

      const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(mockEvent),
        headers: {
          "stripe-signature": "t=1234567890,v1=signature",
        },
      });

      const response = await webhookPOST(req);
      const json = await response.json();

      expect(isEventProcessed).toHaveBeenCalledWith("evt_test_456");
      expect(markEventProcessed).not.toHaveBeenCalled(); // Should not attempt to mark again
      expect(json.received).toBe(true);
      expect(json.skipped).toBe(true);
    });

    it("still returns success if marking fails after processing", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      const { isEventProcessed, markEventProcessed } = await import("@/lib/payments/webhookIdempotency");
      
      const mockEvent = {
        id: "evt_test_789",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test",
            subscription: "sub_test",
            client_reference_id: "user_test",
          },
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any);
      vi.mocked(isEventProcessed).mockResolvedValue(false);
      vi.mocked(markEventProcessed).mockResolvedValue({ success: false, error: "Database error" });

      const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(mockEvent),
        headers: {
          "stripe-signature": "t=1234567890,v1=signature",
        },
      });

      const response = await webhookPOST(req);
      const json = await response.json();

      expect(json.received).toBe(true);
      expect(response.status).toBe(200);
    });
  });

  describe("Rate Limiting", () => {
    it("applies rate limiting to webhook endpoint", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      const { rateLimit } = await import("@/lib/security/rateLimit");
      
      const mockEvent = {
        id: "evt_test_ratelimit",
        type: "checkout.session.completed",
        data: { object: { id: "cs_test", subscription: "sub_test" } },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any);

      const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(mockEvent),
        headers: {
          "stripe-signature": "t=1234567890,v1=signature",
          "x-forwarded-for": "192.168.1.1",
        },
      });

      await webhookPOST(req);

      expect(rateLimit).toHaveBeenCalledWith({
        key: expect.stringContaining("webhook:stripe:"),
        limit: 100,
        window: 60,
      });
    });
  });

  describe("Signature Verification", () => {
    it("rejects webhook with missing signature", async () => {
      const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "test" }),
        headers: {},
      });

      const response = await webhookPOST(req);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Missing stripe signature");
    });

    it("rejects webhook with invalid signature", async () => {
      const { stripe } = await import("@/lib/payments/stripe");
      vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "test" }),
        headers: {
          "stripe-signature": "invalid",
        },
      });

      const response = await webhookPOST(req);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Invalid signature");
    });
  });
});
