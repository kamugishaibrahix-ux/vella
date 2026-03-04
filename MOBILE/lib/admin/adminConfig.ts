// This file contains server-only functions that must be called via dynamic import in client components
// We don't use "server-only" here because it causes build-time analysis issues when dynamically imported
// All server-only imports are made dynamic inside the function to prevent build-time analysis

import type { AdminAIConfig } from "./adminConfigTypes";
import { DEFAULT_ADMIN_AI_CONFIG, mergeAdminAIConfig } from "./adminConfigTypes";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

// Re-export types and constants for convenience
export type { AdminAIConfig } from "./adminConfigTypes";
export { DEFAULT_ADMIN_AI_CONFIG, mergeAdminAIConfig } from "./adminConfigTypes";

// Snapshot cache key
const SNAPSHOT_KEY = "vella_admin_config_snapshot_v1";

// Allowed models for validation
const ALLOWED_TEXT_MODELS = new Set([
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-4o-mini-tts",
  "gpt-4o-light",
]);

const ALLOWED_REALTIME_MODELS = new Set([
  "gpt-4o-realtime-preview",
  "gpt-4o-realtime-mini",
  "gpt-4o-mini",
]);

const ALLOWED_EMBEDDING_MODELS = new Set(["text-embedding-3-small", "text-embedding-3-large"]);

const ALLOWED_REASONING_DEPTHS = new Set(["Light", "Normal", "Analytical", "Deep"]);

type ConfigSource = "supabase" | "snapshot" | "defaults";

type Snapshot = {
  fetchedAtISO: string;
  config: AdminAIConfig;
};

/**
 * Validates the config has the minimal required structure.
 * Returns null if invalid.
 */
function validateMinimalConfig(config: unknown): AdminAIConfig | null {
  if (!config || typeof config !== "object") return null;

  const c = config as Record<string, unknown>;

  // Validate models object exists
  if (!c.models || typeof c.models !== "object") return null;
  const models = c.models as Record<string, unknown>;
  if (typeof models.text_model !== "string") return null;
  if (typeof models.realtime_model !== "string") return null;
  if (typeof models.embedding_model !== "string") return null;
  if (typeof models.reasoning_depth !== "string") return null;
  if (!ALLOWED_REASONING_DEPTHS.has(models.reasoning_depth)) return null;

  // Validate model object exists
  if (!c.model || typeof c.model !== "object") return null;
  const model = c.model as Record<string, unknown>;
  if (typeof model.temperature !== "number" || !Number.isFinite(model.temperature)) return null;
  if (typeof model.max_output !== "number" || !Number.isFinite(model.max_output)) return null;

  // Validate safety object exists
  if (!c.safety || typeof c.safety !== "object") return null;
  const safety = c.safety as Record<string, unknown>;
  if (typeof safety.safety_strictness !== "number" || !Number.isFinite(safety.safety_strictness)) return null;
  if (typeof safety.red_flag_sensitivity !== "number" || !Number.isFinite(safety.red_flag_sensitivity)) return null;
  if (typeof safety.attachment_prevention !== "boolean") return null;
  if (typeof safety.hallucination_reducer !== "boolean") return null;
  if (typeof safety.destabilization_guard !== "boolean") return null;

  // Validate flags object exists
  if (!c.flags || typeof c.flags !== "object") return null;
  const flags = c.flags as Record<string, unknown>;
  if (typeof flags.maintenanceMode !== "boolean") return null;
  if (typeof flags.enableVoice !== "boolean") return null;
  if (typeof flags.enableRealtime !== "boolean") return null;
  if (typeof flags.enableMusicMode !== "boolean") return null;

  // Validate limits object exists
  if (!c.limits || typeof c.limits !== "object") return null;
  const limits = c.limits as Record<string, unknown>;
  if (typeof limits.maxDailyTokensPerUser !== "number" || !Number.isFinite(limits.maxDailyTokensPerUser)) return null;

  // Clamp values to safe ranges
  const clamped: AdminAIConfig = {
    models: {
      text_model: ALLOWED_TEXT_MODELS.has(models.text_model) ? models.text_model : "gpt-4o-mini",
      realtime_model: ALLOWED_REALTIME_MODELS.has(models.realtime_model) ? models.realtime_model : "gpt-4o-realtime-preview",
      embedding_model: ALLOWED_EMBEDDING_MODELS.has(models.embedding_model) ? models.embedding_model : "text-embedding-3-small",
      reasoning_depth: ALLOWED_REASONING_DEPTHS.has(models?.reasoning_depth as string) ? (models?.reasoning_depth as "Light" | "Normal" | "Analytical" | "Deep") : "Normal",
    },
    model: {
      temperature: Math.max(0, Math.min(2, model.temperature)),
      max_output: Math.max(200, Math.min(4000, Math.round(model.max_output))),
    },
    safety: {
      safety_strictness: Math.max(0, Math.min(100, Math.round(safety.safety_strictness))),
      red_flag_sensitivity: Math.max(0, Math.min(100, Math.round(safety.red_flag_sensitivity))),
      attachment_prevention: safety.attachment_prevention,
      hallucination_reducer: safety.hallucination_reducer,
      destabilization_guard: safety.destabilization_guard,
    },
    flags: {
      maintenanceMode: flags.maintenanceMode,
      enableVoice: flags.enableVoice,
      enableRealtime: flags.enableRealtime,
      enableMusicMode: flags.enableMusicMode,
    },
    limits: {
      maxDailyTokensPerUser: Math.max(1000, Math.min(1000000, Math.round(limits.maxDailyTokensPerUser))),
    },

    // PASS THROUGH ENTITLEMENTS (validated later at resolver level)
    planEntitlements:
      (c as Record<string, unknown>).planEntitlements as
        | AdminAIConfig["planEntitlements"]
        | undefined,
  };

  return clamped;
}

/**
 * Writes config snapshot to localStorage.
 */
function writeSnapshot(config: AdminAIConfig): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const snapshot: Snapshot = {
      fetchedAtISO: new Date().toISOString(),
      config,
    };
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota errors
  }
}

/**
 * Reads config snapshot from localStorage.
 */
function readSnapshot(): AdminAIConfig | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    // Validate the snapshot has required structure
    return validateMinimalConfig(parsed.config);
  } catch {
    return null;
  }
}

/**
 * Logs config source in dev mode.
 */
function logConfigSource(source: ConfigSource): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.log(`[adminConfig] Config source: ${source}`);
}

/**
 * Loads the active admin AI configuration.
 * Fetches from Supabase, validates, caches snapshot, with offline fallback.
 *
 * Flow:
 * 1. Try to fetch from Supabase (admin_ai_config table, is_active=true or latest)
 * 2. If fetch succeeds + validates: cache snapshot, return config
 * 3. If fetch fails: try snapshot from localStorage
 * 4. If no snapshot: return defaults
 *
 * Never throws - always returns a valid AdminAIConfig.
 */
export async function loadActiveAdminAIConfig(): Promise<AdminAIConfig> {
  // DEBUG: Log service role presence (boolean only, never log the key)
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log(`[adminConfig] Service role key present: ${hasServiceRole}`);

  try {
    if (!supabaseAdmin) {
      console.warn("[adminConfig] Supabase admin client not available");
      const snapshot = readSnapshot();
      if (snapshot) {
        logConfigSource("snapshot");
        return snapshot;
      }
      logConfigSource("defaults");
      return DEFAULT_ADMIN_AI_CONFIG;
    }

    // Fetch active config from Supabase using service role client
    // Use maybeSingle() to avoid throwing when 0 or multiple rows exist
    const { data: configRow, error } = await supabaseAdmin
      .from("admin_ai_config")
      .select("config")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { config: unknown } | null; error: { message: string } | null };

    // DEBUG: Log whether config was found
    console.log(`[adminConfig] Active config found: ${!!configRow}`);

    if (error) {
      console.warn("[adminConfig] Supabase fetch failed:", error.message);
      const snapshot = readSnapshot();
      if (snapshot) {
        logConfigSource("snapshot");
        return snapshot;
      }
      logConfigSource("defaults");
      return DEFAULT_ADMIN_AI_CONFIG;
    }

    if (!configRow || !configRow.config) {
      console.warn("[adminConfig] No active config in database");
      const snapshot = readSnapshot();
      if (snapshot) {
        logConfigSource("snapshot");
        return snapshot;
      }
      logConfigSource("defaults");
      return DEFAULT_ADMIN_AI_CONFIG;
    }

    // Validate the fetched config
    const validated = validateMinimalConfig(configRow.config);

    if (!validated) {
      // Config invalid - use snapshot or defaults
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[adminConfig] Fetched config failed validation, using snapshot or defaults");
      }
      const snapshot = readSnapshot();
      if (snapshot) {
        logConfigSource("snapshot");
        return snapshot;
      }
      logConfigSource("defaults");
      return DEFAULT_ADMIN_AI_CONFIG;
    }

    // Success - cache snapshot and return
    writeSnapshot(validated);
    logConfigSource("supabase");
    return validated;

  } catch (error) {
    // Unexpected error - use snapshot or defaults
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[adminConfig] Unexpected error:", error);
    }
    const snapshot = readSnapshot();
    if (snapshot) {
      logConfigSource("snapshot");
      return snapshot;
    }
    logConfigSource("defaults");
    return DEFAULT_ADMIN_AI_CONFIG;
  }
}
