export type VellaVoiceId = "luna" | "aira" | "sol" | "orion";

export const DEFAULT_VELLA_VOICE_ID: VellaVoiceId = "luna";

const LEGACY_ALIAS_MAP: Record<string, VellaVoiceId> = {
  aria: "aira",
  luna: "luna",
  aira: "aira",
  sol: "sol",
  orion: "orion",
};

const REALTIME_RENDERER_BY_VOICE: Record<VellaVoiceId, string> = {
  luna: "alloy",
  aira: "shimmer",
  sol: "echo",
  orion: "onyx",
};

/**
 * Server-side mapping: product voice → valid OpenAI TTS voice ID.
 * Used by /api/voice/standard and /api/voice/preview.
 *
 * Valid OpenAI TTS voices (gpt-4o-mini-tts):
 *   alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse
 */
export const TTS_VOICE_MAP: Record<VellaVoiceId, string> = {
  luna: "alloy",
  aira: "shimmer",
  sol: "echo",
  orion: "onyx",
};

export function resolveTTSVoice(value?: string | null): string {
  const normalized = normalizeVellaVoiceId(value);
  return TTS_VOICE_MAP[normalized] ?? TTS_VOICE_MAP[DEFAULT_VELLA_VOICE_ID];
}

export function normalizeVellaVoiceId(value?: string | null): VellaVoiceId {
  if (!value) return DEFAULT_VELLA_VOICE_ID;
  const key = value.toLowerCase().trim();
  return LEGACY_ALIAS_MAP[key] ?? DEFAULT_VELLA_VOICE_ID;
}

export function resolveRealtimeRendererVoice(value?: VellaVoiceId): string {
  const resolved = value ?? DEFAULT_VELLA_VOICE_ID;
  return REALTIME_RENDERER_BY_VOICE[resolved] ?? REALTIME_RENDERER_BY_VOICE[DEFAULT_VELLA_VOICE_ID];
}

