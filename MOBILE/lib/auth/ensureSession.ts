"use client";

import { supabase } from "@/lib/supabase/client";

let sessionPromise: Promise<void> | null = null;

export async function ensureSupabaseSession(): Promise<void> {
  if (!supabase) return;

  if (sessionPromise) {
    return sessionPromise;
  }

  sessionPromise = (async () => {
    const { data } = await supabase.auth.getSession();
    // Local-first: no anonymous sign-in. Just check for existing session.
    if (data?.session) return;
    // No session exists - app should work in local-only mode.
  })();

  return sessionPromise;
}

