import type { VellaAudioMode, VellaAudioPreset, VellaAudioCategory } from "./vellaAudioTypes";

import type { VellaAudioPreset as UnifiedAudioPreset, VellaAudioTrackKind } from "./vellaUnifiedAudio";



// Example of a preset with variants:
// {
//   id: "quick_calm_wave",
//   ...
//   variants: [
//     "/audio/quick/quick_calm_wave_1.mp3",
//     "/audio/quick/quick_calm_wave_2.mp3",
//     "/audio/quick/quick_calm_wave_3.mp3"
//   ]
// }

export const VELLA_AUDIO_CATALOG: VellaAudioPreset[] = [

  // QUICK MOODS

  {

    id: "quick_calm_wave",

    mode: "emotion_calm",

    engineMode: "emotion",

    category: "quick_mood",

    label: "audio.preset.calm.label",

    description: "audio.preset.calm.description",

    tier: "pro",

    style: "ambient",

    variants: [
      "/audio/quick/quick_calm_wave/quick_calm_wave_1.mp3",
      "/audio/quick/quick_calm_wave/quick_calm_wave_2.mp3",
      "/audio/quick/quick_calm_wave/quick_calm_wave_3.mp3",
      "/audio/quick/quick_calm_wave/quick_calm_wave_4.mp3",
      "/audio/quick/quick_calm_wave/quick_calm_wave_5.mp3",
      "/audio/quick/quick_calm_wave/quick_calm_wave_6.mp3",
      "/audio/quick/quick_calm_wave/quick_calm_wave_7.mp3",
    ],

  },

  {

    id: "quick_focus_glow",

    mode: "meditation_focus",

    engineMode: "meditation",

    category: "quick_mood",

    label: "audio.preset.focus.label",

    description: "audio.preset.focus.description",

    tier: "pro",

    style: "meditation",

    variants: [
      "/audio/quick/quick_focus_glow/quick_focus_glow_1.mp3",
      "/audio/quick/quick_focus_glow/quick_focus_glow_2.mp3",
      "/audio/quick/quick_focus_glow/quick_focus_glow_3.mp3",
      "/audio/quick/quick_focus_glow/quick_focus_glow_4.mp3",
      "/audio/quick/quick_focus_glow/quick_focus_glow_5.mp3",
      "/audio/quick/quick_focus_glow/quick_focus_glow_6.mp3",
      "/audio/quick/quick_focus_glow/quick_focus_glow_7.mp3",
    ],

  },

  {

    id: "quick_sleep_wind",

    mode: "emotion_calm",

    engineMode: "emotion",

    category: "quick_mood",

    label: "audio.preset.sleep.label",

    description: "audio.preset.sleep.description",

    tier: "pro",

    style: "meditation",

    variants: [
      "/audio/quick/quick_sleep_wind/quick_sleep_wind_1.mp3",
      "/audio/quick/quick_sleep_wind/quick_sleep_wind_2.mp3",
      "/audio/quick/quick_sleep_wind/quick_sleep_wind_3.mp3",
      "/audio/quick/quick_sleep_wind/quick_sleep_wind_4.mp3",
    ],

  },

  {

    id: "quick_uplift_song",

    mode: "emotion_uplift",

    engineMode: "emotion",

    category: "quick_mood",

    label: "audio.preset.uplift.label",

    description: "audio.preset.uplift.description",

    tier: "pro",

    style: "humming",

    variants: [
      "/audio/quick/quick_uplift_song/quick_uplift_song_1.mp3",
      "/audio/quick/quick_uplift_song/quick_uplift_song_2.mp3",
      "/audio/quick/quick_uplift_song/quick_uplift_song_3.mp3",
      "/audio/quick/quick_uplift_song/quick_uplift_song_4.mp3",
    ],

  },



  // HUMMING / SINGING (Elite)

  {

    id: "hum_soft_1",

    mode: "hum_soft_1",

    engineMode: "singing",

    category: "humming",

    label: "audio.preset.humSoft1.label",

    description: "audio.preset.humSoft1.description",

    tier: "elite",

    style: "humming",

    variants: [
      "/audio/humming/hum_soft_1/hum_soft_1_1.mp3",
      "/audio/humming/hum_soft_1/hum_soft_1_2.mp3",
      "/audio/humming/hum_soft_1/hum_soft_1_3.mp3",
    ],

  },

  {

    id: "hum_soft_2",

    mode: "hum_soft_2",

    engineMode: "singing",

    category: "humming",

    label: "audio.preset.humSoft2.label",

    description: "audio.preset.humSoft2.description",

    tier: "elite",

    style: "humming",

    variants: [
      "/audio/humming/hum_soft_2/hum_soft_2_1.mp3",
      "/audio/humming/hum_soft_2/hum_soft_2_2.mp3",
    ],

  },

  {

    id: "hum_warm_1",

    mode: "hum_warm_1",

    engineMode: "singing",

    category: "humming",

    label: "audio.preset.humWarm1.label",

    description: "audio.preset.humWarm1.description",

    tier: "elite",

    style: "humming",

    variants: [
      "/audio/humming/hum_warm_1/hum_warm_1_1.mp3",
      "/audio/humming/hum_warm_1/hum_warm_1_2.mp3",
    ],

  },





  // MEDITATION

  {

    id: "meditation_breath_slow",

    mode: "meditation_breath_slow",

    engineMode: "meditation",

    category: "meditation",

    label: "audio.preset.meditationBreathSlow.label",

    description: "audio.preset.meditationBreathSlow.description",

    tier: "pro",

    style: "meditation",

    variants: [
      "/audio/meditation/meditation_breath_slow/meditation_breath_slow_1.mp3",
      "/audio/meditation/meditation_breath_slow/meditation_breath_slow_2.mp3",
    ],

  },

  {

    id: "meditation_breath_deep",

    mode: "meditation_breath_deep",

    engineMode: "meditation",

    category: "meditation",

    label: "audio.preset.meditationBreathDeep.label",

    description: "audio.preset.meditationBreathDeep.description",

    tier: "pro",

    style: "meditation",

    variants: [
      "/audio/meditation/meditation_breath_deep/meditation_breath_deep_1.mp3",
      "/audio/meditation/meditation_breath_deep/meditation_breath_deep_2.mp3",
    ],

  },

  {

    id: "meditation_focus",

    mode: "meditation_focus",

    engineMode: "meditation",

    category: "meditation",

    label: "audio.preset.meditationFocus.label",

    description: "audio.preset.meditationFocus.description",

    tier: "pro",

    style: "meditation",

    variants: [
      "/audio/meditation/meditation_focus/meditation_focus_1.mp3",
      "/audio/meditation/meditation_focus/meditation_focus_2.mp3",
    ],

  },

  {

    id: "meditation_grounding",

    mode: "meditation_grounding",

    engineMode: "meditation",

    category: "meditation",

    label: "audio.preset.meditationGrounding.label",

    description: "audio.preset.meditationGrounding.description",

    tier: "pro",

    style: "meditation",

    variants: [
      "/audio/meditation/meditation_grounding/meditation_grounding_1.mp3",
      "/audio/meditation/meditation_grounding/meditation_grounding_2.mp3",
    ],

  },

  {

    id: "meditation_relief",

    mode: "meditation_relief",

    engineMode: "meditation",

    category: "meditation",

    label: "audio.preset.meditationRelief.label",

    description: "audio.preset.meditationRelief.description",

    tier: "pro",

    style: "meditation",

    variants: [
      "/audio/meditation/meditation_relief/meditation_relief_1.mp3",
    ],

  },



  // EMOTIONAL STATE

  {

    id: "emotion_calm",

    mode: "emotion_calm",

    engineMode: "emotion",

    category: "emotional_state",

    label: "audio.preset.emotionCalm.label",

    description: "audio.preset.emotionCalm.description",

    tier: "pro",

    style: "ambient",

    variants: [
      "/audio/emotional_state/emotion_calm/emotion_calm_1.mp3",
      "/audio/emotional_state/emotion_calm/emotion_calm_2.mp3",
    ],

  },

  {

    id: "emotion_grounding",

    mode: "emotion_grounding",

    engineMode: "emotion",

    category: "emotional_state",

    label: "audio.preset.emotionGrounding.label",

    description: "audio.preset.emotionGrounding.description",

    tier: "pro",

    style: "meditation",

    variants: [
      "/audio/emotional_state/emotion_grounding/emotion_grounding_1.mp3",
      "/audio/emotional_state/emotion_grounding/emotion_grounding_2.mp3",
    ],

  },

  {

    id: "emotion_presence",

    mode: "emotion_presence",

    engineMode: "emotion",

    category: "emotional_state",

    label: "audio.preset.emotionPresence.label",

    description: "audio.preset.emotionPresence.description",

    tier: "pro",

    style: "humming",

    variants: [
      "/audio/emotional_state/emotion_presence/emotion_presence_1.mp3",
      "/audio/emotional_state/emotion_presence/emotion_presence_2.mp3",
    ],

  },

  {

    id: "emotion_warmth",

    mode: "emotion_warmth",

    engineMode: "emotion",

    category: "emotional_state",

    label: "audio.preset.emotionWarmth.label",

    description: "audio.preset.emotionWarmth.description",

    tier: "pro",

    style: "humming",

    variants: [
      "/audio/emotional_state/emotion_warmth/emotion_warmth_1.mp3",
      "/audio/emotional_state/emotion_warmth/emotion_warmth_2.mp3",
    ],

  },

  {

    id: "emotion_reassurance",

    mode: "emotion_reassurance",

    engineMode: "emotion",

    category: "emotional_state",

    label: "audio.preset.emotionReassurance.label",

    description: "audio.preset.emotionReassurance.description",

    tier: "pro",

    style: "ambient",

    variants: [
      "/audio/emotional_state/emotion_reassurance/emotion_reassurance_1.mp3",
      "/audio/emotional_state/emotion_reassurance/emotion_reassurance_2.mp3",
      "/audio/emotional_state/emotion_reassurance/emotion_reassurance_3.mp3",
    ],

  },

  {

    id: "emotion_clarity",

    mode: "emotion_clarity",

    engineMode: "emotion",

    category: "emotional_state",

    label: "audio.preset.emotionClarity.label",

    description: "audio.preset.emotionClarity.description",

    tier: "pro",

    style: "ambient",

    variants: [
      "/audio/emotional_state/emotion_clarity/emotion_clarity_1.mp3",
      "/audio/emotional_state/emotion_clarity/emotion_clarity_2.mp3",
    ],

  },

  // VELLA EVENTS (internal-only, not shown in UI)

  {
    id: "event_birthday",
    mode: "singing",
    engineMode: "singing",
    category: "vella_events",
    label: "Birthday event",
    description: "Celebration sound for birthdays.",
    tier: "pro",
    style: "humming",
    variants: [
      "/audio/vella_events/event_birthday/event_birthday_1.mp3",
      "/audio/vella_events/event_birthday/event_birthday_2.mp3",
      "/audio/vella_events/event_birthday/event_birthday_3.mp3",
    ],
  },

  {
    id: "event_cheer",
    mode: "singing",
    engineMode: "singing",
    category: "vella_events",
    label: "Cheer event",
    description: "Encouraging sound for achievements.",
    tier: "pro",
    style: "humming",
    variants: [
      "/audio/vella_events/event_cheer/event_cheer_1.mp3",
      "/audio/vella_events/event_cheer/event_cheer_2.mp3",
    ],
  },

  {
    id: "event_achievement",
    mode: "singing",
    engineMode: "singing",
    category: "vella_events",
    label: "Achievement event",
    description: "Celebration sound for milestones.",
    tier: "pro",
    style: "humming",
    variants: [
      "/audio/vella_events/event_achievement/event_achievement_1.mp3",
    ],
  },

];



const PRESET_BY_ID = new Map<string, VellaAudioPreset>();

const PRESET_BY_MODE = new Map<VellaAudioMode, VellaAudioPreset>();



for (const preset of VELLA_AUDIO_CATALOG) {

  PRESET_BY_ID.set(preset.id, preset);

}



for (const preset of VELLA_AUDIO_CATALOG) {

  if (!PRESET_BY_MODE.has(preset.mode)) {

    PRESET_BY_MODE.set(preset.mode, preset);

  }

}



export function getPresetById(id: string | null | undefined): VellaAudioPreset | undefined {

  if (!id) return undefined;

  return PRESET_BY_ID.get(id);

}



export function getPresetByMode(mode: VellaAudioMode | null | undefined): VellaAudioPreset | undefined {

  if (!mode) return undefined;

  return PRESET_BY_MODE.get(mode);

}



export function getPresetsByCategory(category: VellaAudioCategory): VellaAudioPreset[] {

  return VELLA_AUDIO_CATALOG.filter((preset) => preset.category === category);

}



export function findPresetByIntentText(text: string): VellaAudioPreset | undefined {

  const normalized = text.toLowerCase();

  if (normalized.includes("birthday")) {

    return getPresetById("event_birthday");

  }

  if (normalized.includes("focus") || normalized.includes("concentrat") || normalized.includes("work")) {

    return getPresetById("meditation_focus");

  }

  if (normalized.includes("breathe") || normalized.includes("meditat")) {

    return getPresetById("meditation_breath_slow");

  }

  if (normalized.includes("sleep") || normalized.includes("night")) {

    return getPresetById("quick_sleep_wind");

  }

  if (normalized.includes("calm") || normalized.includes("relax") || normalized.includes("ground")) {

    return getPresetById("emotion_grounding");

  }

  if (normalized.includes("lift") || normalized.includes("cheer")) {

    return getPresetById("emotion_warmth");

  }

  if (normalized.includes("hum") || normalized.includes("sing")) {

    return getPresetById("hum_soft_1");

  }

  if (normalized.includes("rap") || normalized.includes("freestyle")) {

    return getPresetById("hum_soft_2");

  }

  return undefined;

}



const ENGINE_KIND_MAP: Record<string, VellaAudioTrackKind> = {

  meditation: "music",

  emotion: "music",

  music: "music",

  singing: "effect",

};



export function toUnifiedAudioPreset(item: VellaAudioPreset): UnifiedAudioPreset | null {

  const kind =

    item.trackKind ??

    (item.engineMode ? ENGINE_KIND_MAP[item.engineMode] : undefined) ??

    "music";

  // Handle all presets with variants array
  let url: string | undefined;
  if (item.variants && item.variants.length > 0) {
    // Randomly select one variant from the array
    const randomIndex = Math.floor(Math.random() * item.variants.length);
    url = item.variants[randomIndex];
    console.log("[AUDIO] Selected variant", randomIndex + 1, "of", item.variants.length, "for preset", item.id);
    console.log("[AUDIO] playing URL:", url);
  } else {
    // No variants available - this should not happen for valid presets
    console.warn("[AUDIO] No variants found for preset:", item.id);
    return null;
  }

  if (!url) {

    return null;

  }

  return {

    id: item.id,

    url,

    kind,

    loop: item.category === "vella_events" ? false : (item.loop ?? (kind !== "effect")),

    volume: item.volume ?? item.preferredVolume ?? 1,

  };

}
