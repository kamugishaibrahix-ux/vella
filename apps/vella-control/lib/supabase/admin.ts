/**
 * Admin Supabase client utilities.
 * Provides safe access to admin-only database operations.
 */

import { getAdminClient } from "./adminClient";

/**
 * Get the admin Supabase client instance.
 * Use this for direct admin operations.
 */
export const supabaseAdmin = getAdminClient();

/**
 * Get a safe query builder for a specific table.
 * This is a convenience wrapper around the admin client.
 *
 * @param tableName - The name of the table to query
 * @returns A Supabase query builder for the specified table
 */
export function fromSafe(tableName: string) {
  return supabaseAdmin.from(tableName);
}

