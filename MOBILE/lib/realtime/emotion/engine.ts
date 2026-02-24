import {
  type EmotionalState,
  type RelationshipMode,
  clamp,
  clampEmotionalState,
  createBaselineEmotionalState,
} from "./state";
import { extractEmotionalArc } from "./extractArc";

export interface EmotionalUpdateSignals {
  text: string;
  isUser: boolean;
  relationshipMode: RelationshipMode;
  distressScore?: number;
  isHeavyTopic?: boolean;
  turnIndex?: number;
  now?: number;
}

const MAX_DELTA = {
  valence: 0.35,
  arousal: 0.25,
  warmth: 0.45,
  curiosity: 0.3,
  tension: 0.4,
} as const;

const DECAY_RATE_PER_SEC = {
  valence: 0.06,
  arousal: 0.08,
  warmth: 0.05,
  curiosity: 0.04,
  tension: 0.07,
} as const;

export function updateEmotionalState(
  prev: EmotionalState,
  signals: EmotionalUpdateSignals,
): EmotionalState {
  const now = signals.now ?? Date.now();
  const baseline = createBaselineEmotionalState(signals.relationshipMode);
  let state = applyDecay(prev, baseline, now);

  const arc = extractEmotionalArc(signals.text);
  const directionFactor = signals.isUser ? 1 : 0.5;

  let dVal = 0;
  let dArousal = 0;
  let dWarmth = 0;
  let dCuriosity = 0;
  let dTension = 0;

  if (arc.sentiment === "positive") {
    dVal += 0.2;
    dArousal += 0.08;
    dWarmth += 0.15;
  } else if (arc.sentiment === "negative") {
    dVal -= 0.25;
    dTension += 0.2;
    dArousal -= 0.05;
  } else {
    dCuriosity += 0.03;
  }

  dVal *= arc.intensity * directionFactor;
  dArousal *= arc.intensity * directionFactor;
  dWarmth *= arc.intensity * directionFactor;
  dCuriosity *= arc.intensity * directionFactor;
  dTension *= arc.intensity * directionFactor;

  const distress = signals.distressScore ?? 0;
  if (distress > 0.4) {
    dTension += 0.25 * distress;
    dArousal -= 0.1 * distress;
    dWarmth += 0.1 * distress;
    dCuriosity -= 0.05 * distress;
  }

  if (signals.isHeavyTopic && distress < 0.4) {
    dTension += 0.1;
    dCuriosity += 0.05;
  }

  dVal = clamp(dVal, -MAX_DELTA.valence, MAX_DELTA.valence);
  dArousal = clamp(dArousal, -MAX_DELTA.arousal, MAX_DELTA.arousal);
  dWarmth = clamp(dWarmth, -MAX_DELTA.warmth, MAX_DELTA.warmth);
  dCuriosity = clamp(dCuriosity, -MAX_DELTA.curiosity, MAX_DELTA.curiosity);
  dTension = clamp(dTension, -MAX_DELTA.tension, MAX_DELTA.tension);

  state = {
    ...state,
    valence: state.valence + dVal,
    arousal: state.arousal + dArousal,
    warmth: state.warmth + dWarmth,
    curiosity: state.curiosity + dCuriosity,
    tension: state.tension + dTension,
    lastUpdate: now,
  };

  return clampEmotionalState(state);
}

function applyDecay(prev: EmotionalState, baseline: EmotionalState, now: number): EmotionalState {
  if (!prev.lastUpdate) return baseline;
  const elapsedMs = now - prev.lastUpdate;
  if (elapsedMs <= 0) return prev;

  const elapsedSec = elapsedMs / 1000;
  const decayFactor = (rate: number) => Math.min(1, elapsedSec * rate);

  const vDecay = decayFactor(DECAY_RATE_PER_SEC.valence);
  const aDecay = decayFactor(DECAY_RATE_PER_SEC.arousal);
  const wDecay = decayFactor(DECAY_RATE_PER_SEC.warmth);
  const cDecay = decayFactor(DECAY_RATE_PER_SEC.curiosity);
  const tDecay = decayFactor(DECAY_RATE_PER_SEC.tension);

  return {
    ...prev,
    valence: prev.valence + (baseline.valence - prev.valence) * vDecay,
    arousal: prev.arousal + (baseline.arousal - prev.arousal) * aDecay,
    warmth: prev.warmth + (baseline.warmth - prev.warmth) * wDecay,
    curiosity: prev.curiosity + (baseline.curiosity - prev.curiosity) * cDecay,
    tension: prev.tension + (baseline.tension - prev.tension) * tDecay,
    lastUpdate: now,
  };
}

