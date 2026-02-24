"use server";

/**
 * Get authenticated user ID from server-side session.
 * Returns null if unauthenticated. Used by Server Components for optional user display.
 * For API routes requiring auth, use requireUserId from @/lib/supabase/server-auth.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const { getOptionalUserId } = await import("@/lib/supabase/server-auth");
  return getOptionalUserId();
}
