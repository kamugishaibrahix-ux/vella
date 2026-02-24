/**
 * Server-side auth helpers for API routes.
 * Uses Supabase server session (cookies) to resolve authenticated user.
 * No hard-coded identity — requires real session.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export class UnauthenticatedError extends Error {
  constructor(message = "Unauthenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** Consistent 401 response shape for unauthenticated requests */
const UNAUTH_RESPONSE = {
  code: "UNAUTHORIZED" as const,
  error: "unauthorized" as const,
  message: "Authentication required",
} as const;

/**
 * Returns a 401 NextResponse for use when auth fails.
 * Caller should return this directly.
 */
export function unauthResponse() {
  return NextResponse.json(UNAUTH_RESPONSE, { status: 401 });
}

/**
 * Type guard: true if value is a 401 response from requireUserId.
 */
export function isAuthError(value: string | NextResponse): value is NextResponse {
  return value instanceof Response;
}

/**
 * Require authenticated user. Returns userId string or 401 NextResponse.
 * Caller must check: if (result instanceof NextResponse) return result;
 *
 * Usage:
 *   const userIdOr401 = await requireUserId();
 *   if (userIdOr401 instanceof NextResponse) return userIdOr401;
 *   const userId = userIdOr401;
 */
export async function requireUserId(): Promise<string | NextResponse> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return unauthResponse();
    }

    const userId = user.id;
    if (!userId || typeof userId !== "string") {
      return unauthResponse();
    }

    return userId;
  } catch (err) {
    console.error("[server-auth] requireUserId failed:", err);
    return unauthResponse();
  }
}

/**
 * Get authenticated user ID if session exists, otherwise null.
 * Does NOT return 401 — use for optional auth or fallback behavior.
 */
export async function getOptionalUserId(): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user?.id) {
      return null;
    }

    return user.id;
  } catch {
    return null;
  }
}
