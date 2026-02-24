"use client";
// SAFE-DATA PATCH D: This module is restricted to metadata-only storage.

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { assertSafeTable } from "./safeTables";

/**
 * DATA-DESIGN: This module must comply with /DATA_DESIGN.md.
 * - Supabase usage is restricted to metadata only (see "Supabase Usage (Metadata Only)").
 * - No user free-text content may be persisted in Supabase.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL or ANON_KEY not set");
}

const clientOptions = {
  auth: {
    persistSession: true,
  },
} as const;

function createClientInstance(): SupabaseClient<Database> {
  if (!url || !anonKey) {
    throw new Error("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY");
  }
  const client = createSupabaseClient<Database>(url, anonKey, clientOptions);
  const originalFrom = client.from.bind(client);
  client.from = ((table: Parameters<typeof originalFrom>[0]) => {
    assertSafeTable(table as string);
    return originalFrom(table);
  }) as typeof client.from;
  return client;
}

export const supabase = url && anonKey ? createClientInstance() : null;

export function createClient() {
  return createClientInstance();
}

export default supabase;


