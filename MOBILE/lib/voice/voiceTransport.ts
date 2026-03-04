/**
 * Voice Transport Layer
 *
 * Single source of truth for which voice transport a plan tier uses.
 * - "standard" → turn-based HTTP (STT → LLM → TTS), available to ALL plans
 * - "realtime" → WebRTC streaming via OpenAI Realtime API, when enableRealtime is true
 *
 * IMPORTANT: Do NOT inline plan-to-transport logic elsewhere.
 * Always import resolveVoiceTransport from this file.
 * Uses entitlements.enableRealtime (capability-based), not tier strings.
 */

import type { PlanEntitlement } from "@/lib/plans/types";

export type VoiceTransport = "standard" | "realtime";

/**
 * Resolve which voice transport to use based on entitlements.
 *
 * When enableRealtime is true → realtime (WebRTC streaming).
 * Otherwise → standard (HTTP turn-based).
 */
export function resolveVoiceTransport(entitlements: PlanEntitlement | null): VoiceTransport {
  if (entitlements?.enableRealtime) {
    return "realtime";
  }
  return "standard";
}
