/**
 * Integration tests for API route validation.
 * Tests oversized messages, unknown fields, and validation error responses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as clarityPOST } from "@/app/api/clarity/route";
import { POST as journalPOST, PUT as journalPUT } from "@/app/api/journal/route";
import { POST as stripeCheckoutPOST } from "@/app/api/stripe/create-checkout-session/route";
import { NextRequest } from "next/server";

// Mock authentication
vi.mock("@/lib/supabase/server-auth", () => ({
  requireUserId: vi.fn().mockResolvedValue("test-user-id"),
}));

// Mock rate limiting
vi.mock("@/lib/security/rateLimit", () => ({
  rateLimit: vi.fn().mockResolvedValue(undefined),
  isRateLimitError: vi.fn().mockReturnValue(false),
  rateLimit429Response: vi.fn(),
}));

// Mock token enforcement
vi.mock("@/lib/tokens/enforceTokenLimits", () => ({
  checkTokenAvailability: vi.fn().mockResolvedValue({ allowed: true }),
  chargeTokensForOperation: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock tier check
vi.mock("@/lib/tiers/server", () => ({
  getUserPlanTier: vi.fn().mockResolvedValue("free"),
}));

// Mock AI agent
vi.mock("@/lib/ai/agents", () => ({
  runClarityEngine: vi.fn().mockResolvedValue({ result: "clarity output" }),
}));

// Mock journal functions
vi.mock("@/lib/journal/server", () => ({
  createJournalEntry: vi.fn().mockResolvedValue({
    id: "entry-123",
    user_id: "test-user-id",
    content: "Test entry",
    created_at: new Date().toISOString(),
  }),
  updateJournalEntry: vi.fn().mockResolvedValue({
    id: "entry-123",
    user_id: "test-user-id",
    content: "Updated entry",
    created_at: new Date().toISOString(),
  }),
}));

// Mock journal enrichment functions
vi.mock("@/lib/journal/summarizeJournal", () => ({
  summarizeJournal: vi.fn().mockResolvedValue("Summary"),
}));
vi.mock("@/lib/journal/extractEmotionTags", () => ({
  extractEmotionTags: vi.fn().mockResolvedValue(["happy"]),
}));
vi.mock("@/lib/journal/tagLifeThemes", () => ({
  tagLifeThemes: vi.fn().mockResolvedValue(["growth"]),
}));
vi.mock("@/lib/journal/detectLoopsInText", () => ({
  detectLoopsInText: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/journal/detectDistortionsInText", () => ({
  detectDistortionsInText: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/journal/extractTraitMarkers", () => ({
  extractTraitMarkers: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/journal/generateFollowUpQuestions", () => ({
  generateFollowUpQuestions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/journal/generateMicroInsights", () => ({
  generateMicroInsights: vi.fn().mockResolvedValue([]),
}));

// Mock progress and connection functions
vi.mock("@/lib/progress/calculateProgress", () => ({
  updateProgress: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/connection/depthEngine", () => ({
  updateConnectionDepth: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/memory/lastActive", () => ({
  updateLastActive: vi.fn().mockResolvedValue(undefined),
}));

// Mock Stripe
vi.mock("@/lib/payments/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" }),
      },
    },
  },
  PLAN_PRICE_IDS: {
    pro: "price_test_pro",
    elite: "price_test_elite",
  },
}));

describe("API Route Validation Integration", () => {
  describe("POST /api/clarity", () => {
    it("rejects oversized message (over 1000 chars)", async () => {
      const req = new NextRequest("http://localhost:3000/api/clarity", {
        method: "POST",
        body: JSON.stringify({ freeText: "a".repeat(1001) }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await clarityPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("rejects unknown fields", async () => {
      const req = new NextRequest("http://localhost:3000/api/clarity", {
        method: "POST",
        body: JSON.stringify({
          freeText: "Valid text",
          unknownField: "should be rejected",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await clarityPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("accepts valid input", async () => {
      const req = new NextRequest("http://localhost:3000/api/clarity", {
        method: "POST",
        body: JSON.stringify({ freeText: "This is a valid message" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await clarityPOST(req);
      expect(response.status).toBe(200);
    });
  });

  describe("POST /api/journal", () => {
    it("rejects oversized text (over 10000 chars)", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "POST",
        body: JSON.stringify({ text: "a".repeat(10001) }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("rejects oversized title (over 200 chars)", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "POST",
        body: JSON.stringify({
          text: "Valid text",
          title: "a".repeat(201),
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("rejects unknown fields", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "POST",
        body: JSON.stringify({
          text: "Valid text",
          unknownField: "should be rejected",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("accepts valid input", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "POST",
        body: JSON.stringify({
          text: "My journal entry for today",
          title: "Today's reflection",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPOST(req);
      expect(response.status).toBe(200);
    });
  });

  describe("PUT /api/journal", () => {
    it("rejects unknown fields", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "PUT",
        body: JSON.stringify({
          id: "entry-123",
          text: "Valid text",
          unknownField: "should be rejected",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPUT(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/stripe/create-checkout-session", () => {
    it("rejects unknown fields", async () => {
      const req = new NextRequest("http://localhost:3000/api/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({
          plan: "pro",
          unknownField: "should be rejected",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await stripeCheckoutPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("rejects free plan", async () => {
      const req = new NextRequest("http://localhost:3000/api/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "free" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await stripeCheckoutPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("accepts valid plan", async () => {
      const req = new NextRequest("http://localhost:3000/api/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "pro" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await stripeCheckoutPOST(req);
      expect(response.status).toBe(200);
    });
  });
});
