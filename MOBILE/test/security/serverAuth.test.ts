/**
 * SECURITY: Verifies auth helpers produce correct 401 response shape.
 * Unauthenticated requests to protected routes must return 401 with consistent format.
 */
import { describe, it, expect } from "vitest";
import { unauthResponse, isAuthError } from "@/lib/supabase/server-auth";

describe("server-auth (security)", () => {
  it("unauthResponse returns 401 with consistent error shape", async () => {
    const response = unauthResponse();
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toMatchObject({
      code: "UNAUTHORIZED",
      error: "unauthorized",
      message: "Authentication required",
    });
  });

  it("isAuthError identifies NextResponse as auth error", () => {
    const errResp = unauthResponse();
    expect(isAuthError(errResp)).toBe(true);
  });

  it("isAuthError returns false for string (userId)", () => {
    expect(isAuthError("user-123")).toBe(false);
  });
});
