"use server";

// Helper for server environments; uses next/headers so never import it in client code
// Consumers dynamically import this module from route handlers/admin helpers only

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";

export async function createServerSupabaseClient() {
  return createServerComponentClient<Database>({ cookies });
}
