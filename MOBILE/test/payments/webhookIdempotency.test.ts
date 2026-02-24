/**
 * Tests for webhook idempotency to prevent double-processing.
 * markEventProcessed uses safeInsert(..., supabaseAdmin), which calls
 * supabaseAdmin.from("webhook_events").insert(row) — so we mock that chain.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isEventProcessed, markEventProcessed } from "@/lib/payments/webhookIdempotency";

// Mock Supabase: supabaseAdmin.from().insert() is the path used by safeInsert in markEventProcessed
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
  fromSafe: vi.fn(),
}));

describe("webhookIdempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isEventProcessed", () => {
    it("returns false when event not found", async () => {
      const { fromSafe } = await import("@/lib/supabase/admin");
      vi.mocked(fromSafe).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      } as any);

      const result = await isEventProcessed("evt_test_123");
      expect(result).toBe(false);
    });

    it("returns true when event found", async () => {
      const { fromSafe } = await import("@/lib/supabase/admin");
      vi.mocked(fromSafe).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: "some-uuid", event_id: "evt_test_123" },
        }),
      } as any);

      const result = await isEventProcessed("evt_test_123");
      expect(result).toBe(true);
    });

    it("returns false on database error (fail-open)", async () => {
      const { fromSafe } = await import("@/lib/supabase/admin");
      vi.mocked(fromSafe).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockRejectedValue(new Error("Database error")),
      } as any);

      const result = await isEventProcessed("evt_test_123");
      expect(result).toBe(false);
    });
  });

  describe("markEventProcessed", () => {
    it("successfully marks event as processed (first time)", async () => {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: [{ id: "gen-uuid" }], error: null }),
      } as any);

      const result = await markEventProcessed("evt_test_123", "checkout.session.completed");
      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("returns success and alreadyProcessed on duplicate key (23505)", async () => {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        }),
      } as any);

      const result = await markEventProcessed("evt_test_123", "checkout.session.completed");
      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns error on database failure", async () => {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "XX000", message: "Unknown error" },
        }),
      } as any);

      const result = await markEventProcessed("evt_test_123", "checkout.session.completed");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
