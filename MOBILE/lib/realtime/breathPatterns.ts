export type BreathStyleKey = "calm" | "empathetic" | "narrative" | "focused";

export interface BreathPattern {
  id: string;
  probability: number; // how likely we inject it
  minWords: number; // number of words required before injecting
  prefix: string; // what sound/hint to insert
  style: BreathStyleKey;
}

export const BREATH_PATTERNS: BreathPattern[] = [
  {
    id: "calm-soft-inhale",
    probability: 0.18,
    minWords: 8,
    prefix: "[soft inhale] ",
    style: "calm",
  },
  {
    id: "empathetic-sigh",
    probability: 0.12,
    minWords: 6,
    prefix: "[gentle exhale] ",
    style: "empathetic",
  },
  {
    id: "narrative-takebreath",
    probability: 0.25,
    minWords: 10,
    prefix: "[breath] ",
    style: "narrative",
  },
  {
    id: "focused-micropause",
    probability: 0.14,
    minWords: 7,
    prefix: "[pause] ",
    style: "focused",
  },
];

export function injectBreathOverlay(
  text: string,
  style: BreathStyleKey,
): string {
  if (!text) return text;

  const words = text.trim().split(/\s+/);
  const count = words.length;

  const patterns = BREATH_PATTERNS.filter(
    (p) => p.style === style && count >= p.minWords,
  );

  if (patterns.length === 0) return text;

  const seedString = `${style}-${count}-${text.length}`;
  let hash = 0;
  for (let i = 0; i < seedString.length; i += 1) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  const normalized = ((hash >>> 0) % 1000) / 1000;
  let cumulative = 0;
  for (const p of patterns) {
    cumulative += p.probability;
    if (normalized <= cumulative) {
      return `${p.prefix}${text}`;
    }
  }

  return text;
}

