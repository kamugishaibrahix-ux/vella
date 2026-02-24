import { RELATIONSHIP_MODES } from "@/lib/ai/persona/personaConfig";
import type { EmotionalMemorySnapshot } from "@/lib/memory/types";

export interface EmotionalState {
  valence: number; // -1 (very negative) to +1 (very positive)
  arousal: number; // 0 (very calm) to 1 (very energized)
  warmth: number; // 0 (cold) to 1 (very warm)
  curiosity: number; // 0 (not curious) to 1 (very curious)
  tension: number; // 0 (relaxed) to 1 (very tense)
  lastUpdate: number;
}

export type RelationshipMode = keyof typeof RELATIONSHIP_MODES;

const blend = (baseValue: number, memoryValue?: number, weight = 0.35) => {
  if (typeof memoryValue !== "number" || Number.isNaN(memoryValue)) {
    return baseValue;
  }
  return baseValue * (1 - weight) + memoryValue * weight;
};

export function createBaselineEmotionalState(
  relationshipMode: RelationshipMode = "best_friend",
  overrides: Partial<EmotionalState> = {},
  emotionalMemory?: EmotionalMemorySnapshot | null,
): EmotionalState {
  const now = Date.now();

  let base: EmotionalState = {
    valence: 0,
    arousal: 0,
    warmth: 0.4,
    curiosity: 0.3,
    tension: 0.2,
    lastUpdate: now,
  };

  const mods = RELATIONSHIP_MODES[relationshipMode]?.emotionalBaseline ?? {};
  base = {
    ...base,
    ...mods,
    lastUpdate: now,
  };

  if (emotionalMemory) {
    base = {
      ...base,
      valence: blend(base.valence, emotionalMemory.avgValence),
      warmth: blend(base.warmth, emotionalMemory.avgWarmth),
      curiosity: blend(base.curiosity, emotionalMemory.avgCuriosity),
      tension: blend(base.tension, emotionalMemory.avgTension),
    };
  }

  return {
    ...base,
    ...overrides,
    lastUpdate: overrides.lastUpdate ?? now,
  };
}

export function clampEmotionalState(state: EmotionalState): EmotionalState {
  return {
    ...state,
    valence: clamp(state.valence, -1, 1),
    arousal: clamp(state.arousal, 0, 1),
    warmth: clamp(state.warmth, 0, 1),
    curiosity: clamp(state.curiosity, 0, 1),
    tension: clamp(state.tension, 0, 1),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
