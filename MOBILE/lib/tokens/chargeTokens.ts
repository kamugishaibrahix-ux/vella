import { recordUsage } from "@/lib/budget/usageEngine";

/**
 * Unified token-charging system.
 *
 * STILL SAFE MODE:
 * - No blocking
 * - No enforcement
 * - No hard limits
 * - Purely deducts and logs usage
 *
 * Enforcement will be added in Phase 5.
 */

export async function chargeTokens(
  userId: string,
  plan: "free" | "pro" | "elite",
  payload: {
    textTokens?: number;
    realtimeSeconds?: number;
    audioClips?: number;
    route?: string;
  }
) {
  const text = payload.textTokens ?? 0;
  const seconds = payload.realtimeSeconds ?? 0;
  const clips = payload.audioClips ?? 0;

  const totalTokens =
    text * 2 +               // 2x multiplier
    seconds * 20 +           // realtime cost
    clips * 5000;            // audio clip cost

  // safe-mode logging: does NOT enforce
  await recordUsage(userId, {
    plan,
    channel:
      clips > 0
        ? "audio"
        : seconds > 0
        ? "realtime_voice"
        : "text",
    textTokens: text,
    realtimeSeconds: seconds,
    audioClips: clips,
    route: payload.route,
  });

  return {
    ok: true,
    chargedTokens: totalTokens,
  };
}

