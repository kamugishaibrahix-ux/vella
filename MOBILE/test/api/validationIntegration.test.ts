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

// Mock journal functions (metadata-only)
vi.mock("@/lib/journal/server", () => ({
  createJournalMeta: vi.fn().mockResolvedValue({
    id: "entry-123",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    wordCount: 5,
    localHash: "a".repeat(64),
    processingMode: "private",
  }),
  updateJournalMeta: vi.fn().mockResolvedValue({
    id: "entry-123",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    wordCount: 5,
    localHash: "a".repeat(64),
    processingMode: "private",
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

  describe("POST /api/journal (metadata-only)", () => {
    const validMeta = {
      id: "a0000000-0000-4000-8000-000000000001",
      word_count: 5,
      local_hash: "a".repeat(64),
      processing_mode: "private" as const,
    };

    it("rejects payload containing text field (TEXT_NOT_ALLOWED)", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "POST",
        body: JSON.stringify({ ...validMeta, text: "smuggled text" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("TEXT_NOT_ALLOWED");
    });

    it("rejects payload containing title field (TEXT_NOT_ALLOWED)", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "POST",
        body: JSON.stringify({ ...validMeta, title: "smuggled title" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("TEXT_NOT_ALLOWED");
    });

    it("rejects payload containing content field (TEXT_NOT_ALLOWED)", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "POST",
        body: JSON.stringify({ ...validMeta, content: "smuggled content" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("TEXT_NOT_ALLOWED");
    });

    it("rejects unknown fields (strict schema)", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "POST",
        body: JSON.stringify({ ...validMeta, unknownField: "should be rejected" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPOST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("accepts valid metadata-only payload", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "POST",
        body: JSON.stringify(validMeta),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPOST(req);
      expect(response.status).toBe(200);
    });
  });

  describe("PUT /api/journal (metadata-only)", () => {
    const validUpdate = {
      id: "entry-123",
      word_count: 10,
      local_hash: "b".repeat(64),
      processing_mode: "signals_only" as const,
    };

    it("rejects payload containing text field (TEXT_NOT_ALLOWED)", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "PUT",
        body: JSON.stringify({ ...validUpdate, text: "smuggled" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPUT(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("TEXT_NOT_ALLOWED");
    });

    it("rejects unknown fields", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "PUT",
        body: JSON.stringify({ ...validUpdate, unknownField: "nope" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPUT(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("accepts valid metadata-only update", async () => {
      const req = new NextRequest("http://localhost:3000/api/journal", {
        method: "PUT",
        body: JSON.stringify(validUpdate),
        headers: { "Content-Type": "application/json" },
      });

      const response = await journalPUT(req);
      expect(response.status).toBe(200);
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
