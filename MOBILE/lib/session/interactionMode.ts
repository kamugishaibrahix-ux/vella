/**
 * Interaction Mode — User-facing conversation style selector.
 * Controls response structure and gates contract proposals.
 * Orthogonal to VellaMode (vent/listen/challenge/coach/crisis) which is
 * server-resolved from governance state and controls safety behaviour.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InteractionMode = "reflect" | "guide" | "plan";

export const INTERACTION_MODES: readonly InteractionMode[] = ["reflect", "guide", "plan"] as const;

export const DEFAULT_INTERACTION_MODE: InteractionMode = "reflect";

export const INTERACTION_MODE_LABELS: Record<InteractionMode, string> = {
  reflect: "Reflect",
  guide: "Guide",
  plan: "Plan",
};

export const INTERACTION_MODE_DESCRIPTIONS: Record<InteractionMode, string> = {
  reflect: "Explore thoughts",
  guide: "Get advice",
  plan: "Build a plan",
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isInteractionMode(value: unknown): value is InteractionMode {
  return typeof value === "string" && INTERACTION_MODES.includes(value as InteractionMode);
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "vella_interaction_mode";

export function getStoredInteractionMode(): InteractionMode {
  if (typeof window === "undefined") return DEFAULT_INTERACTION_MODE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isInteractionMode(stored) ? stored : DEFAULT_INTERACTION_MODE;
  } catch {
    return DEFAULT_INTERACTION_MODE;
  }
}

export function setStoredInteractionMode(mode: InteractionMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable — degrade silently
  }
}
