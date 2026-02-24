export interface VoiceIdentity {
  warmth: number;
  softness: number;
  clarity: number;
  assertiveness: number;
  melodic: number;
}

export const DEFAULT_VOICE_IDENTITY: VoiceIdentity = {
  warmth: 0.65,
  softness: 0.55,
  clarity: 0.9,
  assertiveness: 0.4,
  melodic: 0.2,
};

export function loadVoiceIdentity(): VoiceIdentity {
  try {
    const data = localStorage.getItem("vella_voice_identity");
    if (!data) return DEFAULT_VOICE_IDENTITY;
    return { ...DEFAULT_VOICE_IDENTITY, ...JSON.parse(data) };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[persona/voiceIdentity] persistence failed:", err);
    }
    return DEFAULT_VOICE_IDENTITY;
  }
}

export function saveVoiceIdentity(identity: VoiceIdentity) {
  try {
    localStorage.setItem("vella_voice_identity", JSON.stringify(identity));
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[persona/voiceIdentity] persistence failed:", err);
    }
  }
}

