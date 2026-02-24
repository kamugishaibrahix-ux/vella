import type { EmotionalState } from "@/lib/realtime/emotion/state";
import { MUSIC_PROFILES, type MusicProfileKey } from "./musicProfiles";

export function selectMusicProfile(emotion: EmotionalState): MusicProfileKey {
  if (emotion.tension > 0.6) return "calm";
  if (emotion.valence > 0.4 && emotion.arousal > 0.5) return "bright";
  if (emotion.valence < -0.2) return "emotional";
  if (emotion.arousal < 0.3) return "calm";
  return "focus";
}

export { MUSIC_PROFILES };

