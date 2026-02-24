import { supabase } from "@/lib/supabase/client";

export async function ensureAnonSession() {
  const client = supabase;
  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ensureAnonSession] Supabase client unavailable; skipping anon session.");
    }
    return null;
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error("[ensureAnonSession] Session lookup failed", error);
  }

  // Local-first: no anonymous sign-in. Return existing session or null.
  return data?.session ?? null;
}

