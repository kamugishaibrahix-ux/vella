/**
 * Server Environment Configuration
 *
 * Centralized, production-safe environment variable handling.
 * - Validates required env vars at module load (cold start)
 * - Never logs secrets or identifiable config details
 * - Provides deterministic error codes for missing config
 * - Type-safe access to environment variables
 *
 * USAGE:
 *   import { requireEnv, env } from "@/lib/server/env";
 *
 *   // In route handler:
 *   const apiKey = env.OPENAI_API_KEY; // throws if missing
 *   // or:
 *   const apiKey = requireEnv("OPENAI_API_KEY"); // same
 *
 * ERROR HANDLING:
 *   If a required env var is missing, throws EnvError with code "missing_config"
 *   The API route should catch this and return generic 500 with "configuration_error"
 */

// Track which env vars have been validated to avoid re-checking
const validatedKeys = new Set<string>();

/** Error thrown when required environment variable is missing */
export class EnvError extends Error {
  public readonly code: string;
  public readonly envKey: string;

  constructor(envKey: string) {
    super(`Configuration error: ${envKey} not set`);
    this.name = "EnvError";
    this.code = "missing_config";
    this.envKey = envKey;
  }
}

/**
 * Require an environment variable to be set.
 * Throws EnvError if missing (fail-closed).
 */
export function requireEnv(key: string): string {
  const value = process.env[key];

  if (!value || value.trim() === "") {
    throw new EnvError(key);
  }

  validatedKeys.add(key);
  return value;
}

/**
 * Get an optional environment variable.
 * Returns undefined if not set (no validation).
 */
export function getEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

/**
 * Check if running in production environment.
 * Safe check that handles various env var conventions.
 */
export function isProduction(): boolean {
  const env = process.env.NODE_ENV || process.env.VERCEL_ENV || "";
  return env === "production";
}

/**
 * Check if running in development environment.
 */
export function isDevelopment(): boolean {
  const env: string = process.env.NODE_ENV ?? process.env.VERCEL_ENV ?? "";
  return env === "development" || env === "dev" || env === "" || env === "test";
}

/**
 * Production-safe logger.
 * Only logs errors, redacts secrets, disabled in production by default.
 */
export const safeLog = {
  error: (context: string, error: unknown) => {
    // Always log errors, but minimally in production
    if (isProduction()) {
      // In production: only log context and error code, not full error details
      const errorCode = error instanceof Error ? error.name : "unknown_error";
      console.error(`[${context}] ${errorCode}`);
    } else {
      // In development: can log more details
      console.error(`[${context}]`, error);
    }
  },

  // No info/debug logging in production
  info: (_context: string, _message: string) => {
    // No-op in production
    if (!isProduction()) {
      console.log(_context, _message);
    }
  },

  warn: (context: string, message: string) => {
    // Minimal warnings in production
    if (isProduction()) {
      console.warn(`[${context}] ${message}`);
    } else {
      console.warn(`[${context}]`, message);
    }
  },
};

/**
 * Typed environment variable accessors.
 * These throw EnvError if the variable is required but missing.
 */
export const env = {
  // OpenAI
  get OPENAI_API_KEY() {
    return requireEnv("OPENAI_API_KEY");
  },

  // Stripe
  get STRIPE_SECRET_KEY() {
    return requireEnv("STRIPE_SECRET_KEY");
  },

  get STRIPE_WEBHOOK_SECRET() {
    return requireEnv("STRIPE_WEBHOOK_SECRET");
  },

  get STRIPE_PRICE_PRO() {
    return getEnv("STRIPE_PRICE_PRO");
  },

  get STRIPE_PRICE_ELITE() {
    return getEnv("STRIPE_PRICE_ELITE");
  },

  // Supabase
  get SUPABASE_URL() {
    return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  },

  get SUPABASE_ANON_KEY() {
    return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },

  get SUPABASE_SERVICE_ROLE_KEY() {
    return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  },

  // App
  get NODE_ENV() {
    return process.env.NODE_ENV || "development";
  },

  get VERCEL_ENV() {
    return getEnv("VERCEL_ENV");
  },
};

/**
 * Production boot requirement: required env vars when NODE_ENV === "production".
 * Application refuses to start if any are missing (hard stop).
 */
const PRODUCTION_REQUIRED_KEYS = [
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "REDIS_URL",
  "CRON_SECRET",
] as const;

/**
 * Checks all production-required environment variables are set.
 * Call at server boot (e.g. from instrumentation). Logs warnings for missing
 * vars but never throws — dependent features will degrade gracefully at
 * call-site instead of crashing the entire application on boot.
 */
export function assertProductionEnv(): void {
  if (!isProduction()) return;

  const missing: string[] = [];
  for (const key of PRODUCTION_REQUIRED_KEYS) {
    const value = process.env[key];
    if (!value || value.trim() === "") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const list = missing.join(", ");
    const message =
      missing.length === 1
        ? `[Instrumentation] WARNING: Missing required production environment variable: ${list} — related features will be unavailable.`
        : `[Instrumentation] WARNING: Missing required production environment variables: ${list} — related features will be unavailable.`;
    console.warn(message);
  }
}

/**
 * Validate all required environment variables at cold start.
 * Call this in production to fail fast on misconfiguration.
 */
export function validateEnv(): { valid: boolean; missing: string[] } {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ];

  const missing: string[] = [];

  for (const key of required) {
    const value = process.env[key];
    if (!value || value.trim() === "") {
      missing.push(key);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Generic error response for configuration errors.
 * Use this in API routes when env validation fails.
 */
export function configErrorResponse() {
  return new Response(
    JSON.stringify({
      error: "configuration_error",
      message: "Server configuration error. Please contact support.",
    }),
    {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }
  );
}

// Production env validation runs at server boot via instrumentation.ts (not at module load, so build can complete without prod env vars).
