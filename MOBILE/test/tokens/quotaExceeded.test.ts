/**
 * SECURITY: Verifies quota exceeded returns 402 with stable code.
 */
import { describe, it, expect } from "vitest";
import { quotaExceededResponse, QUOTA_EXCEEDED_RESPONSE } from "@/lib/tokens/quotaExceededResponse";

describe("quotaExceededResponse", () => {
  it("returns 402 with stable JSON shape", async () => {
    const resp = quotaExceededResponse();
    expect(resp.status).toBe(402);
    const json = await resp.json();
    expect(json.code).toBe("QUOTA_EXCEEDED");
    expect(json).toEqual(QUOTA_EXCEEDED_RESPONSE);
  });
});
