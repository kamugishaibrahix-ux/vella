export type VoiceStyleKey = "default" | "whisper" | "asmr" | "story";

export interface VoiceStyleConfig {
  key: VoiceStyleKey;
  label: string;
  shortLabel?: string;
  description: string;
  sessionInstruction: string;
}

const SHARED_NO_ROBOT_INSTRUCTION =
  "Never sound stiff or robotic. Vary your rhythm slightly, use natural pauses between phrases, and avoid machine-gun delivery.";

export const VOICE_STYLES: VoiceStyleConfig[] = [
  {
    key: "default",
    label: "Default",
    description: "Calm, friendly cadence with balanced pacing.",
    sessionInstruction: [
      "Speak naturally in a calm, friendly tone with a medium pace and clear articulation.",
      "Use normal microphone distance; do not whisper.",
      "Maintain gentle pauses between phrases so the delivery feels relaxed and human.",
      SHARED_NO_ROBOT_INSTRUCTION,
    ].join(" "),
  },
  {
    key: "whisper",
    label: "Whisper",
    description: "Soft, gentle near-field delivery.",
    sessionInstruction: [
      "Speak in a soft whisper-like tone with short sentences and slightly slower pacing.",
      "Sound intimate, as if talking to someone right next to you, without ever raising your volume.",
      "Keep everything low and gentle—no shouting, no sudden bursts of energy.",
      SHARED_NO_ROBOT_INSTRUCTION,
    ].join(" "),
  },
  {
    key: "asmr",
    label: "ASMR",
    description: "Ultra-soft, ultra-slow, deeply soothing.",
    sessionInstruction: [
      "Speak extremely slowly and softly with very short sentences and frequent gentle pauses.",
      "Use highly soothing, reassuring language; never raise your voice above a low, relaxing register.",
      "Avoid crisp over-articulation or news-presenter diction—keep consonants soft and flowing.",
      SHARED_NO_ROBOT_INSTRUCTION,
    ].join(" "),
  },
  {
    key: "story",
    label: "Story",
    shortLabel: "Storyteller",
    description: "Gentle storytelling flow with rich intonation.",
    sessionInstruction: [
      "Speak like a warm storyteller with slightly longer sentences and melodic intonation.",
      "Add calm emphasis to emotionally important words and pause briefly at natural beats.",
      "Stay grounded and gentle—never theatrical or over-the-top.",
      SHARED_NO_ROBOT_INSTRUCTION,
    ].join(" "),
  },
];

const fallbackStyle = VOICE_STYLES[0];

export function getVoiceStyle(key?: VoiceStyleKey | null): VoiceStyleConfig {
  if (!key) return fallbackStyle;
  const style = VOICE_STYLES.find((cfg) => cfg.key === key);
  return style ?? fallbackStyle;
}

