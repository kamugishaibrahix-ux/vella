/**
 * BACKWARD COMPATIBILITY RE-EXPORT
 *
 * ⚠️ DEPRECATED: This module is a re-export for backward compatibility.
 * The actual implementation has moved to @/lib/server/supabaseAdmin
 *
 * NEW CODE SHOULD IMPORT FROM:
 *   import { supabaseAdmin, fromSafe } from "@/lib/server/supabaseAdmin";
 *
 * This file will be removed in a future update. Migrate all imports
to the new server-only location.
 */

// Re-export everything from the server-only module
export {
  supabaseAdmin,
  createAdminClient,
  fromSafe,
  wrapMetadataClient,
  type SafeTableName,
} from "@/lib/server/supabaseAdmin";
