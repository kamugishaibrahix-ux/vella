/**
 * Execution Spine — Phase 2: Guardrails.
 * Resolves guardrail configuration from defaults + localStorage prefs.
 * No Supabase reads (user_preferences doesn't have orchestration_prefs column).
 * Pure config resolution — enforcement logic lives in triggerEngine.shouldFireTrigger.
 */

import type { GuardrailConfig } from "./types";
import { readFlag, writeFlag, readISODate } from "@/lib/local/runtimeFlags";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_GUARDRAILS: GuardrailConfig = {
  max_triggers_per_day: 5,
  cooldown_minutes: 30,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

const LOCAL_STORAGE_KEY = "vella_execution_guardrails";

// ---------------------------------------------------------------------------
// Resolve config
// ---------------------------------------------------------------------------

/**
 * Resolve guardrail config. Reads from localStorage if present, else defaults.
 * This is a client-only function (uses localStorage).
 */
export function resolveGuardrails(): GuardrailConfig {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ...DEFAULT_GUARDRAILS };
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GUARDRAILS };

    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_GUARDRAILS };

    return {
      max_triggers_per_day: validInt(parsed.max_triggers_per_day, 1, 50, DEFAULT_GUARDRAILS.max_triggers_per_day),
      cooldown_minutes: validInt(parsed.cooldown_minutes, 1, 1440, DEFAULT_GUARDRAILS.cooldown_minutes),
      quiet_hours_start: validHourOrNull(parsed.quiet_hours_start),
      quiet_hours_end: validHourOrNull(parsed.quiet_hours_end),
    };
  } catch {
    return { ...DEFAULT_GUARDRAILS };
  }
}

/**
 * Persist guardrail overrides to localStorage.
 * Call from a settings UI or dev console.
 */
export function saveGuardrails(config: Partial<GuardrailConfig>): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  const current = resolveGuardrails();
  const merged: GuardrailConfig = {
    max_triggers_per_day: config.max_triggers_per_day ?? current.max_triggers_per_day,
    cooldown_minutes: config.cooldown_minutes ?? current.cooldown_minutes,
    quiet_hours_start: config.quiet_hours_start !== undefined ? config.quiet_hours_start : current.quiet_hours_start,
    quiet_hours_end: config.quiet_hours_end !== undefined ? config.quiet_hours_end : current.quiet_hours_end,
  };

  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
}

// ---------------------------------------------------------------------------
// Dev toggle: enable/disable trigger engine
// ---------------------------------------------------------------------------

const ENABLED_KEY = "vella_trigger_engine_enabled";
const SOFT_START_KEY = "vella_soft_start_until";

/**
 * Check if trigger engine is enabled.
 *
 * Resolution order:
 *   1. If key is explicitly "true"  → enabled.
 *   2. If key is explicitly "false" → disabled (user override respected).
 *   3. If key is null (never set):
 *      - If vella_soft_start_until is set → user completed onboarding → treat as enabled.
 *      - Otherwise → pre-onboarding session → disabled.
 */
export function isTriggerEngineEnabled(): boolean {
  const raw = readFlag(ENABLED_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  // raw === null: infer from onboarding completion marker
  return readISODate(SOFT_START_KEY) !== null;
}

/** Enable or disable the trigger engine (dev toggle). */
export function setTriggerEngineEnabled(enabled: boolean): void {
  writeFlag(ENABLED_KEY, enabled ? "true" : "false");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validInt(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== "number" || !Number.isInteger(val)) return fallback;
  if (val < min || val > max) return fallback;
  return val;
}

function validHourOrNull(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== "number" || !Number.isInteger(val)) return null;
  if (val < 0 || val > 23) return null;
  return val;
}

export { DEFAULT_GUARDRAILS };
