"use client";
// SAFE-DATA PATCH D: This module is restricted to metadata-only storage.

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { assertSafeTable } from "./safeTables";

/**
 * DATA-DESIGN: This module must comply with /DATA_DESIGN.md.
 * - Supabase usage is restricted to metadata only (see "Supabase Usage (Metadata Only)").
 * - No user free-text content may be persisted in Supabase.
 */

let _instance: SupabaseClient<Database> | null = null;

function getClientInstance(): SupabaseClient<Database> | null {
  if (_instance) return _instance;
  try {
    const client = createClientComponentClient<Database>();
    const originalFrom = client.from.bind(client);
    client.from = ((table: Parameters<typeof originalFrom>[0]) => {
      assertSafeTable(table as string);
      return originalFrom(table);
    }) as typeof client.from;
    _instance = client;
    return _instance;
  } catch {
    return null;
  }
}

export const supabase = getClientInstance();

export function createClient() {
  const c = getClientInstance();
  if (!c) throw new Error("[supabase] Unable to create client");
  return c;
}

export default supabase;


