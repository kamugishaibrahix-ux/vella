import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

// Read env vars at module load time (never throws)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Create a Supabase server client for use in Server Components and API routes.
 * Validates environment variables when called (not at import time).
 * 
 * @throws {Error} If NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY are not set
 */
export function createServerSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }

  return createServerComponentClient({ cookies });
}

/**
 * Create a Supabase client for direct use (e.g., in middleware).
 * Validates environment variables when called (not at import time).
 * 
 * @throws {Error} If NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY are not set
 */
export function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

