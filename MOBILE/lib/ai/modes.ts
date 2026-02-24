/**
 * Hybrid Coupling v1: Explicit Vella conversation mode enum.
 * Used for metadata (conversation_metadata_v2.mode_enum) and mode resolution.
 */

export type VellaMode = "vent" | "listen" | "challenge" | "coach" | "crisis";

export const DEFAULT_MODE: VellaMode = "listen";

export const VELLA_MODE_VALUES: readonly VellaMode[] = [
  "vent",
  "listen",
  "challenge",
  "coach",
  "crisis",
] as const;

export function isVellaMode(value: unknown): value is VellaMode {
  return typeof value === "string" && (VELLA_MODE_VALUES as readonly string[]).includes(value);
}
