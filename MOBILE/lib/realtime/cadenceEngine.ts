// DIAGNOSTICS ONLY — This file must NEVER influence realtime voice delivery.
// All voice behaviour is controlled exclusively by personaSynth + vellaRealtimeConfig.
// Cadence computations are for local diagnostics only, not sent to API or used in instructions.

export type CadenceMood = "neutral" | "soothing" | "encouraging" | "playful";

export interface CadenceProfile {
  basePause: number;
  microPause: number;
  breathiness: number;
  variability: number;
  emotionalSlowdown: number;
}

export const DEFAULT_CADENCE: CadenceProfile = {
  basePause: 90,
  microPause: 40,
  breathiness: 0.15,
  variability: 0.3,
  emotionalSlowdown: 0.5,
};

export interface CadenceHints {
  pause: number;
  microPause: number;
  breath: "light" | "none";
  variability: number;
  mood?: CadenceMood;
}

export function inferCadenceMood(text: string): CadenceMood {
  if (!text) return "neutral";
  const lower = text.toLowerCase();
  if (
    /safe|here with you|breathe|calm|gentle|relax|soft|sleep|rest|overwhelm|anxious/.test(lower)
  ) {
    return "soothing";
  }
  if (/you can|proud of you|keep going|believe in you|progress|growth|strong/.test(lower)) {
    return "encouraging";
  }
  if (/game|silly|fun|imagine|playful|joke|magic|adventure/.test(lower)) {
    return "playful";
  }
  return "neutral";
}

// DIAGNOSTICS ONLY - This function computes cadence hints for local diagnostics
// DO NOT use these values to send speech_cadence via session.update
// Voice delivery is controlled solely by personaSynth.ts instructions
export function computeCadenceHints(
  text: string,
  profile = DEFAULT_CADENCE,
): CadenceHints {
  const emotionalWords = ["feel", "sad", "love", "hurt", "afraid", "anxious"];
  const hasEmotion = emotionalWords.some((w) => text.toLowerCase().includes(w));
  const multiplier = hasEmotion ? 1 + profile.emotionalSlowdown : 1;
  const breathSeed = text.length % 100;
  const breathThreshold = breathSeed / 100;
  return {
    pause: profile.basePause * multiplier,
    microPause: profile.microPause * multiplier,
    breath: profile.breathiness > breathThreshold ? "light" : "none",
    variability: profile.variability,
    mood: inferCadenceMood(text),
  };
}

export interface PseudoSingingHints {
  melodicScore: number;
  phraseLiftPoints: number[];
  phraseFallPoints: number[];
  sustainHints: number[];
}

const STORY_WORDS = [
  "story",
  "dream",
  "safe",
  "calm",
  "lullaby",
  "sleep",
  "breathe",
  "rest",
  "night",
  "gentle",
];

export function computePseudoSingingHints(text: string): PseudoSingingHints {
  if (!text) {
    return {
      melodicScore: 0,
      phraseLiftPoints: [],
      phraseFallPoints: [],
      sustainHints: [],
    };
  }

  const lower = text.toLowerCase();
  const liftPoints: number[] = [];
  const fallPoints: number[] = [];
  const sustainPoints: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "?") {
      liftPoints.push(i);
    } else if (char === "!" || char === ".") {
      fallPoints.push(i);
    } else if (char === ",") {
      sustainPoints.push(i);
    }
  }

  let melodicScore = 0.15;
  if (STORY_WORDS.some((w) => lower.includes(w))) {
    melodicScore += 0.25;
  }
  if (liftPoints.length > 0) melodicScore += 0.1;
  if (fallPoints.length > 0) melodicScore += 0.05;
  melodicScore = Math.min(1, melodicScore);

  return {
    melodicScore,
    phraseLiftPoints: liftPoints,
    phraseFallPoints: fallPoints,
    sustainHints: sustainPoints,
  };
}

