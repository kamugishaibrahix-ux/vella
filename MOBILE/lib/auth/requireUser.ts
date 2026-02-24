"use server";

/**
 * Re-exports requireUserId from server-auth.
 * Use @/lib/supabase/server-auth for API routes.
 */
export { requireUserId } from "@/lib/supabase/server-auth";
