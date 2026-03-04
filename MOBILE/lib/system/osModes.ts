/**
 * Personal OS Modes — single source of truth.
 *
 * These map directly to EnforcementMode from priorityEngine.ts:
 *   strict  → hard enforcement, blocks violating actions
 *   soft    → supportive enforcement, gentler guardrails
 *   observe → no active enforcement, monitoring only
 *
 * The user can set a preferred mode as a hint to the system.
 * Server-side governance may override based on risk/escalation.
 */

export type OSMode = "strict" | "soft" | "observe";

export const OS_MODES: readonly OSMode[] = ["strict", "soft", "observe"] as const;

export const DEFAULT_OS_MODE: OSMode = "soft";

export const OS_MODE_LABELS: Record<OSMode, string> = {
  strict: "Strict",
  soft: "Soft",
  observe: "Observe",
};

export const OS_MODE_DESCRIPTIONS: Record<OSMode, string> = {
  strict: "Firm guardrails, blocks risky actions",
  soft: "Gentle guidance, supportive nudges",
  observe: "Monitoring only, no active enforcement",
};

export function isOSMode(value: unknown): value is OSMode {
  return typeof value === "string" && (OS_MODES as readonly string[]).includes(value);
}

export function validateOSMode(value: unknown): OSMode {
  return isOSMode(value) ? value : DEFAULT_OS_MODE;
}

const STORAGE_KEY = "vella_os_mode";

export function getStoredOSMode(): OSMode {
  if (typeof window === "undefined") return DEFAULT_OS_MODE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isOSMode(stored) ? stored : DEFAULT_OS_MODE;
  } catch {
    return DEFAULT_OS_MODE;
  }
}

export function setStoredOSMode(mode: OSMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}
