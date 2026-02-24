export type VellaAudioMode =
  | "music"
  | "meditation"
  | "emotion"
  | "singing"
  // HUMMING / SINGING (no lyrics)
  | "hum_soft_1"
  | "hum_soft_2"
  | "hum_soft_3"
  | "hum_warm_1"
  | "hum_warm_2"
  | "hum_birthday_1"
  | "hum_birthday_2"
  // MEDITATION / BREATHWORK
  | "meditation_breath_slow"
  | "meditation_breath_deep"
  | "meditation_focus"
  | "meditation_grounding"
  | "meditation_relief"
  // EMOTIONAL STATES
  | "emotion_calm"
  | "emotion_uplift"
  | "emotion_grounding"
  | "emotion_presence"
  | "emotion_warmth"
  | "emotion_reassurance"
  | "emotion_clarity"
  | "ambient_night";

export type VellaAudioCategory = "quick_mood" | "humming" | "meditation" | "emotional_state" | "vella_events";

export type VellaAudioStyle = "humming" | "meditation" | "emotional_state" | "ambient";

export interface VellaAudioPreset {
  id: string;
  mode: VellaAudioMode;
  engineMode?: "music" | "meditation" | "emotion" | "singing";
  category: VellaAudioCategory;
  label: string;
  description: string;
  tier: "pro" | "elite";
  style: VellaAudioStyle;
  preferredVolume?: number;
  streamUrl?: string;
  prompt?: string;
  voiceStyle?: string;
  trackKind?: "music" | "ambience" | "effect";
  audioUrl?: string;
  loop?: boolean;
  volume?: number;
  variants?: string[];
}

export interface VellaAudioDescriptor {
  id?: string;
  mode: VellaAudioMode;
  title?: string;
  description?: string;
  source?: "preset" | "intent" | "directive";
  kind?: VellaAudioPreset["trackKind"];
}

export type VellaAudioStatus = "idle" | "loading" | "playing" | "error";

export interface VellaAudioState {
  status: VellaAudioStatus;
  current?: VellaAudioDescriptor | null;
  error?: string | null;
}

export interface VellaAudioRequest {
  presetId?: string;
  intent?: string;
  mode?: VellaAudioMode;
  emotionHint?: string | null;
  toneHint?: string | null;
  timeOfDay?: string | null;
  connectionDepth?: number | null;
}

export function getDefaultDuration(mode: VellaAudioMode): number {
  switch (mode) {
    case "hum_birthday_1":
    case "hum_birthday_2":
      return 18;
    case "hum_soft_1":
    case "hum_soft_2":
    case "hum_soft_3":
    case "hum_warm_1":
    case "hum_warm_2":
      return 20;
    case "meditation_breath_slow":
    case "meditation_breath_deep":
      return 45;
    case "meditation_focus":
    case "meditation_grounding":
    case "meditation_relief":
    case "emotion_calm":
    case "emotion_uplift":
    case "emotion_grounding":
    case "emotion_presence":
    case "emotion_warmth":
    case "emotion_reassurance":
    case "emotion_clarity":
    default:
      return 30;
  }
}

export type VellaAudioIntensity = "low" | "medium" | "high";

export interface VellaAudioDirective {
  mode: VellaAudioMode;
  intensity: VellaAudioIntensity;
  reason: string;
  autoPlay: boolean;
  allowUserOverride: boolean;
}

export interface VellaAudioResponse {
  audioBase64: string;
  descriptor: VellaAudioDescriptor;
}


