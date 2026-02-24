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
  aira: "young_female",
  sol: "young_male",
  orion: "mature_male",
};

export function normalizeVellaVoiceId(value?: string | null): VellaVoiceId {
  if (!value) return DEFAULT_VELLA_VOICE_ID;
  const key = value.toLowerCase().trim();
  return LEGACY_ALIAS_MAP[key] ?? DEFAULT_VELLA_VOICE_ID;
}

export function resolveRealtimeRendererVoice(value?: VellaVoiceId): string {
  const resolved = value ?? DEFAULT_VELLA_VOICE_ID;
  return REALTIME_RENDERER_BY_VOICE[resolved] ?? REALTIME_RENDERER_BY_VOICE[DEFAULT_VELLA_VOICE_ID];
}

