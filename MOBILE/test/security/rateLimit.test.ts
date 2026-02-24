/**
 * SECURITY: Rate limiting must block requests and return 429.
 * Verifies rateLimit() throws RateLimitError when limit exceeded,
 * rateLimit429Response returns standardized format,
 * getClientIp extracts IP, and rateLimitByIp/rateLimitByUser work.
 */
import { describe, it, expect } from "vitest";
import {
  rateLimit,
  rateLimitByIp,
  rateLimitByUser,
  getClientIp,
  isRateLimitError,
  rateLimit429Response,
  RATE_LIMITED_RESPONSE,
} from "@/lib/security/rateLimit";

describe("rateLimit (security)", () => {
  it("throws RateLimitError when limit exceeded within window", async () => {
    const key = `test-rate-limit-${Date.now()}`;
    const limit = 2;
    const windowSec = 60;

    await rateLimit({ key, limit, window: windowSec });
    await rateLimit({ key, limit, window: windowSec });

    const err = await rateLimit({ key, limit, window: windowSec }).catch((e) => e);
    expect(err).toBeDefined();
    expect(isRateLimitError(err)).toBe(true);
    expect(err.name).toBe("RateLimitError");
    expect(err.message).toBe("RATE_LIMITED");
    expect(typeof err.retryAfterSeconds).toBe("number");
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("rateLimit429Response returns 429 with stable JSON shape", async () => {
    const resp = rateLimit429Response(60);
    expect(resp.status).toBe(429);
    expect(resp.headers.get("Retry-After")).toBe("60");

    const json = await resp.json();
    expect(json).toEqual(RATE_LIMITED_RESPONSE);
    expect(json.code).toBe("RATE_LIMITED");
    expect(json.message).toBeDefined();
  });

  it("rateLimit429Response omits Retry-After when not provided", () => {
    const resp = rateLimit429Response();
    expect(resp.status).toBe(429);
    expect(resp.headers.get("Retry-After")).toBeNull();
  });

  it("getClientIp extracts first IP from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": " 1.2.3.4 , 10.0.0.1 " },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("getClientIp falls back to x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("5.6.7.8");
  });

  it("rateLimitByIp enforces per-IP limit", async () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    const key = `test-ip-${Date.now()}`;
    await rateLimitByIp(req, key, 1, 60);
    await expect(rateLimitByIp(req, key, 1, 60)).rejects.toMatchObject({
      name: "RateLimitError",
    });
  });

  it("rateLimitByUser enforces per-user limit", async () => {
    const key = `test-user-${Date.now()}`;
    await rateLimitByUser("u1", key, 1, 60);
    await expect(rateLimitByUser("u1", key, 1, 60)).rejects.toMatchObject({
      name: "RateLimitError",
    });
  });
});
