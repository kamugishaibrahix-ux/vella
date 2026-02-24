import { RELATIONSHIP_MODES } from "./personaConfig";
import { TONE_PROFILES, type ToneProfileKey } from "./toneProfiles";
import type { EmotionalState, RelationshipMode } from "@/lib/realtime/emotion/state";

export function blendPersonaProfile(
  tone: ToneProfileKey = "soft",
  relationshipMode: RelationshipMode = "best_friend",
  emotion: EmotionalState,
) {
  const baseTone = TONE_PROFILES[tone] ?? TONE_PROFILES.soft;
  const rel = RELATIONSHIP_MODES[relationshipMode] ?? RELATIONSHIP_MODES.best_friend;
  const relWarmth = rel.emotionalBaseline?.warmth ?? 0.4;
  const relCuriosity =
    (rel.emotionalBaseline as { curiosity?: number } | undefined)?.curiosity ?? 0.3;

  const warmth =
    baseTone.warmth * 0.5 + relWarmth * 0.3 + emotion.warmth * 0.2;

  const directness =
    baseTone.directness * 0.7 + emotion.arousal * 0.2 + emotion.tension * 0.1;

  const playfulness =
    baseTone.playfulness * 0.5 +
    (emotion.valence > 0 ? emotion.valence * 0.3 : 0) +
    relCuriosity * 0.2;

  const cadence =
    emotion.arousal < 0.3 ? "slow" : emotion.arousal > 0.7 ? "fast" : baseTone.cadence;

  return {
    warmth,
    directness,
    playfulness,
    cadence,
  };
}

