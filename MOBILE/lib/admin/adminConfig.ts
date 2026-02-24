// This file contains server-only functions that must be called via dynamic import in client components
// We don't use "server-only" here because it causes build-time analysis issues when dynamically imported
// All server-only imports are made dynamic inside the function to prevent build-time analysis

import type { AdminAIConfig } from "./adminConfigTypes";
import { DEFAULT_ADMIN_AI_CONFIG, mergeAdminAIConfig } from "./adminConfigTypes";

// Re-export types and constants for convenience
export type { AdminAIConfig } from "./adminConfigTypes";
export { DEFAULT_ADMIN_AI_CONFIG, mergeAdminAIConfig } from "./adminConfigTypes";

type AdminAIConfigRow = {
  config: unknown;
  is_active: boolean;
  created_at: string;
};

/**
 * Loads the active admin AI configuration.
 * Local-first: always returns default config.
 * 
 * This function is server-only and must be called via dynamic import in client components.
 */
export async function loadActiveAdminAIConfig(): Promise<AdminAIConfig> {
  // Local-first: no Supabase, return defaults
  return DEFAULT_ADMIN_AI_CONFIG;
}

