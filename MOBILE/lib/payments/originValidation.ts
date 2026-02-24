/**
 * Origin validation for Stripe checkout URL building.
 * Prevents origin poisoning by validating against an allowlist.
 */

// Cache for allowed origins, cleared when env changes
let cachedAllowedOrigins: Set<string> | null = null;
let lastEnvSignature: string | null = null;

/**
 * Parse and validate allowed origins from environment variable.
 * Returns a Set of normalized origins (lowercase, no trailing slash).
 */
function parseAllowedOrigins(): Set<string> {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "";
  const origins = allowedOriginsEnv
    .split(",")
    .map((origin) => origin.trim().toLowerCase().replace(/\/$/, ""))
    .filter(Boolean);

  // Always include NEXT_PUBLIC_APP_URL as an allowed origin
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    origins.push(appUrl.trim().toLowerCase().replace(/\/$/, ""));
  }

  // Default fallback for local development
  if (process.env.NODE_ENV === "development") {
    origins.push("http://localhost:3000");
    origins.push("http://127.0.0.1:3000");
  }

  return new Set(origins.filter(Boolean));
}

/**
 * Get allowed origins with caching for performance.
 * Cache is invalidated when environment variables change.
 */
function getAllowedOriginsInternal(): Set<string> {
  const currentSignature = `${process.env.ALLOWED_ORIGINS}|${process.env.NEXT_PUBLIC_APP_URL}|${process.env.NODE_ENV}`;

  if (cachedAllowedOrigins && lastEnvSignature === currentSignature) {
    return cachedAllowedOrigins;
  }

  cachedAllowedOrigins = parseAllowedOrigins();
  lastEnvSignature = currentSignature;
  return cachedAllowedOrigins;
}

/**
 * Canonical base URL to use when origin is missing or not allowed.
 * Falls back to NEXT_PUBLIC_APP_URL or localhost for development.
 */
function getCanonicalBaseUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    return appUrl.trim().replace(/\/$/, "");
  }
  // Safe fallback for development
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  // Production fallback - should never reach here if NEXT_PUBLIC_APP_URL is set
  console.warn("[origin-validation] NEXT_PUBLIC_APP_URL not set in production, using empty fallback");
  return "";
}

/**
 * Validate and normalize an origin header.
 * Returns a trusted origin from the allowlist, or the canonical base URL if invalid.
 *
 * @param originHeader - The value of the "origin" header from the request
 * @returns A trusted origin URL (no trailing slash)
 */
export function getValidatedOrigin(originHeader: string | null): string {
  if (!originHeader) {
    // Origin missing - use canonical base URL
    return getCanonicalBaseUrl();
  }

  const normalizedOrigin = originHeader.trim().toLowerCase().replace(/\/$/, "");
  const ALLOWED_ORIGINS = getAllowedOriginsInternal();

  if (ALLOWED_ORIGINS.has(normalizedOrigin)) {
    // Origin is in allowlist
    return normalizedOrigin;
  }

  // Origin not allowed - log warning and use canonical base URL
  console.warn(`[origin-validation] Untrusted origin rejected: ${originHeader}`);
  return getCanonicalBaseUrl();
}

/**
 * For testing: get the current set of allowed origins.
 */
export function getAllowedOrigins(): Set<string> {
  return getAllowedOriginsInternal();
}
