/**
 * SECURITY: Verifies rate limiting blocks requests and returns 429 on affected routes.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server-auth", () => ({
  requireUserId: vi.fn().mockResolvedValue("rate-test-deepdive-user"),
}));

vi.mock("@/lib/ai/agents", () => ({
  runDeepDive: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/tokens/enforceTokenLimits", () => ({
  checkTokenAvailability: vi.fn().mockResolvedValue({ allowed: true, remaining: 10000, mode: "enforced" }),
  chargeTokensForOperation: vi.fn().mockResolvedValue({ success: true, remaining: 10000 }),
}));

const { POST } = await import("@/app/api/deepdive/route");

function mkRequest() {
  return new NextRequest("http://localhost/api/deepdive", {
    method: "POST",
    body: JSON.stringify({ section: "facts", text: "test" }),
  });
}

describe("deepdive route rate limiting", () => {
  it("returns 429 with stable JSON shape when limit exceeded", async () => {
    // First 2 succeed (limit=2)
    const r1 = await POST(mkRequest());
    const r2 = await POST(mkRequest());
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // 3rd hits limit -> 429
    const r3 = await POST(mkRequest());
    expect(r3.status).toBe(429);
    const json = await r3.json();
    expect(json.code).toBe("RATE_LIMITED");
    expect(json.message).toBeDefined();
    const retryAfter = r3.headers.get("Retry-After");
    if (retryAfter) {
      expect(parseInt(retryAfter, 10)).toBeGreaterThan(0);
    }
  });
});
