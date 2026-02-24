// SAFE-DATA PATCH D: This module is restricted to metadata-only storage.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { assertSafeTable, type SafeTableName } from "./safeTables";

/**
 * DATA-DESIGN: This module must comply with /DATA_DESIGN.md.
 * - Supabase usage is restricted to metadata only (see "Supabase Usage (Metadata Only)").
 * - No user free-text content may be persisted in Supabase.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn("[supabase-admin] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

export const supabaseAdmin =
  url && serviceKey
    ? wrapMetadataClient(
        createClient<Database>(url, serviceKey, {
          auth: {
            persistSession: false,
          },
        }),
      )
    : null;

export function createAdminClient() {
  return supabaseAdmin;
}

function wrapMetadataClient(client: SupabaseClient<Database> | null) {
  if (!client) return client;
  const originalFrom = client.from.bind(client);
  client.from = ((table: Parameters<typeof originalFrom>[0]) => {
    assertSafeTable(table as string);
    return originalFrom(table);
  }) as typeof client.from;
  return client;
}

type TableRow<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Row"];
type TableInsert<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Insert"];
type TableUpdate<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Update"];

export function fromSafe<TableName extends SafeTableName & keyof Database["public"]["Tables"]>(
  table: TableName,
) {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not configured.");
  }
  assertSafeTable(table as string);
  return supabaseAdmin.from(table);
}


