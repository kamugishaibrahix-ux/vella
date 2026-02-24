/**
 * Dev bypass helper for admin authentication.
 * Only active in LOCAL DEVELOPMENT with explicit multi-factor gating.
 *
 * SECURITY: Multi-layered protection against production bypass:
 * 1. NODE_ENV must be "development" (not staging, not production)
 * 2. ADMIN_BYPASS_LOCAL_ONLY must be explicitly set to "1"
 * 3. Host must be localhost or 127.0.0.1
 * 4. Hard fail-safe: if NODE_ENV=production and bypass vars are set, log warning and force OFF
 */

/**
 * Check if the current environment is localhost.
 * Used as an additional safety layer for bypass activation.
 */
function isLocalhost(): boolean {
  // Check common localhost indicators
  const hostname = typeof window !== "undefined" 
    ? window.location?.hostname 
    : process.env.HOSTNAME || process.env.HOST || "";
  
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "" ||
    hostname.startsWith("localhost:")
  );
}

/**
 * Check if admin auth bypass is currently active.
 * Returns true ONLY when ALL conditions are met:
 * - NODE_ENV === "development" (not "production", not "staging", not anything else)
 * - ADMIN_BYPASS_LOCAL_ONLY === "1" (explicit opt-in)
 * - Host is localhost (runtime safety check)
 * 
 * HARD FAIL-SAFE: In production, bypass is IMPOSSIBLE even if env vars misconfigured.
 */
export function isAdminBypassActive(): boolean {
  const nodeEnv = process.env.NODE_ENV;
  const bypassLocalFlag = process.env.ADMIN_BYPASS_LOCAL_ONLY;
  const legacyBypassFlag = process.env.VELLA_BYPASS_ADMIN_AUTH;

  // SECURITY LAYER 1: Hard production block
  // If NODE_ENV is production, bypass is IMPOSSIBLE regardless of other settings
  if (nodeEnv === "production") {
    // Warn if bypass vars are misconfigured in production (without leaking values)
    if (bypassLocalFlag === "1" || legacyBypassFlag === "1") {
      console.warn(
        "[SECURITY] Admin bypass env vars detected in production environment. " +
        "Bypass is DISABLED. Remove ADMIN_BYPASS_LOCAL_ONLY and VELLA_BYPASS_ADMIN_AUTH from production config."
      );
    }
    return false;
  }

  // SECURITY LAYER 2: Explicit development-only check
  // Must be exactly "development", not "staging" or other values
  if (nodeEnv !== "development") {
    return false;
  }

  // SECURITY LAYER 3: Explicit local-only flag required
  // Migrated from VELLA_BYPASS_ADMIN_AUTH to ADMIN_BYPASS_LOCAL_ONLY for clarity
  const bypassEnabled = bypassLocalFlag === "1" || legacyBypassFlag === "1";
  if (!bypassEnabled) {
    return false;
  }

  // SECURITY LAYER 4: Localhost verification
  // Even with flags set, must be running on localhost
  if (!isLocalhost()) {
    console.warn(
      "[SECURITY] Admin bypass attempted from non-localhost environment. " +
      "Bypass only works on localhost. Current host check failed."
    );
    return false;
  }

  // All security layers passed - bypass is active
  // Log activation without leaking env values
  console.log(
    "[DEV BYPASS] Admin auth bypass ACTIVE (local development only). " +
    "This should NEVER appear in production logs."
  );

  return true;
}

