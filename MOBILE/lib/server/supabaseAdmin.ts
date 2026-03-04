/**
 * SERVER-ONLY Supabase Admin Client
 *
 * ⚠️ CRITICAL: This module MUST NEVER be imported by client-side code.
 * It contains the SUPABASE_SERVICE_ROLE_KEY which grants full database access.
 *
 * Guards:
 * 1. Runtime: Throws if executed in browser context
 * 2. Build-time: Located in lib/server/* which is server-only by convention
 * 3. Verification: scripts/verify-admin-client-isolation.mjs checks for violations
 *
 * If you see the error "SERVER_ONLY_MODULE_VIOLATION", it means client code
 * is trying to import this module - this is a security breach.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { assertSafeTable, type SafeTableName } from "@/lib/supabase/safeTables";

// ---------------------------------------------------------------------------
// RUNTIME CLIENT DETECTION GUARD
// ---------------------------------------------------------------------------
// This guard runs at module load time to prevent accidental client execution

const isClient = () => {
  // Browser environment detection
  if (typeof window !== "undefined" && window.document) {
    return true;
  }
  // Next.js runtime hints
  if (process.env.NEXT_RUNTIME === "edge" && typeof (globalThis as unknown as { EdgeRuntime?: unknown }).EdgeRuntime === "undefined") {
    // Edge runtime but no EdgeRuntime global suggests browser
    return true;
  }
  return false;
};

if (isClient()) {
  // Throw a non-leaky error that doesn't reveal what module was accessed
  throw new Error(
    "SERVER_ONLY_MODULE_VIOLATION: This module can only be used server-side. " +
    "Check your imports - server code may be leaking into client bundle."
  );
}

// ---------------------------------------------------------------------------
// ADMIN CLIENT CONFIGURATION
// ---------------------------------------------------------------------------

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  if (process.env.NODE_ENV !== "test") {
    // Use safeLog pattern - minimal error in production
    const msg = "[supabase-admin] Missing required environment variables";
    if (process.env.NODE_ENV === "production") {
      // In production, don't log to avoid noise
    } else {
      console.warn(msg);
    }
  }
}

// ---------------------------------------------------------------------------
// METADATA CLIENT WRAPPER
// ---------------------------------------------------------------------------
// Enforces safe table access for metadata-only storage

function wrapMetadataClient(client: SupabaseClient<Database> | null) {
  if (!client) return client;
  const originalFrom = client.from.bind(client);
  client.from = ((table: Parameters<typeof originalFrom>[0]) => {
    assertSafeTable(table as string);
    return originalFrom(table);
  }) as typeof client.from;
  return client;
}

// ---------------------------------------------------------------------------
// ADMIN CLIENT EXPORT
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SAFE TABLE ACCESS
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// BACKWARD COMPATIBILITY EXPORTS
// ---------------------------------------------------------------------------
// Re-export wrapMetadataClient for modules that need it directly

export { wrapMetadataClient };

// Re-export safe table types
export type { SafeTableName };
