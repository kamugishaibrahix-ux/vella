import type { TonePreference } from "@/lib/memory/types";
import type { SessionState, EmotionIntelBundle } from "@/lib/ai/types";
import type { MemoryProfile } from "@/lib/memory/types";

const stableChance = (seed: string, threshold: number): boolean => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const normalized = ((hash >>> 0) % 1000) / 1000;
  return normalized < threshold;
};

const pickDeterministic = <T>(items: T[], seed: string): T => {
  let hash = 17;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % items.length;
  return items[index]!;
};

export function generateMicroReward(params: {
  latestUserMessage: string;
  tone: TonePreference;
  sessionState: SessionState | null;
  emotionIntel: EmotionIntelBundle | null;
  memory: MemoryProfile | null;
}): string | null {
  const { latestUserMessage, tone, sessionState, emotionIntel, memory } = params;
  const text = latestUserMessage.toLowerCase();

  const gateSeed = `${text.length}-${sessionState?.totalTurns ?? 0}`;
  if (!stableChance(gateSeed, 0.2)) return null;

  const honesty =
    text.includes("i feel") ||
    text.includes("i'm feeling") ||
    text.includes("i think") ||
    text.includes("i don't know") ||
    text.includes("i'm not sure");

  const naming =
    text.includes("because") ||
    text.includes("the reason") ||
    text.includes("i realised") ||
    text.includes("i realized") ||
    text.includes("i guess");

  const courage =
    text.includes("hard") ||
    text.includes("difficult") ||
    text.includes("scared") ||
    text.includes("afraid");

  const primaryEmotion = emotionIntel?.emotion?.primaryEmotion ?? null;

  const warmRewards = [
    "That kind of honesty matters.",
    "It takes real courage to name that.",
    "You’re giving yourself space to understand this — that’s meaningful.",
    "You’re being very real with yourself, and that’s not easy.",
  ];

  const softRewards = [
    "That was a steady, thoughtful step.",
    "You handled that with clarity.",
    "There’s a grounded quality in how you expressed that.",
  ];

  const directRewards = [
    "That was a clear, honest insight.",
    "You named the core of that well.",
    "That’s sharp self-awareness.",
  ];

  const stoicRewards = [
    "That was a disciplined moment of honesty.",
    "There’s strength in seeing things as they are.",
    "You’re cultivating clarity — that’s rare and meaningful.",
  ];

  let pool: string[] = [];

  if (tone === "warm") pool.push(...warmRewards);
  if (tone === "soft") pool.push(...softRewards);
  if (tone === "direct") pool.push(...directRewards);
  if (tone === "stoic") pool.push(...stoicRewards);

  const bias = memory?.styleBias;
  if (bias) {
    if (bias.warm > bias.direct) pool.push(...warmRewards);
    if (bias.direct > bias.warm) pool.push(...directRewards);
    if (bias.stoic > bias.warm) pool.push(...stoicRewards);
    if (bias.soft > bias.direct) pool.push(...softRewards);
  }

  const phase = sessionState?.phase ?? "opening";
  if (phase === "exploring") pool.push(...warmRewards);
  if (phase === "clarifying") pool.push(...directRewards);
  if (phase === "integrating") pool.push(...softRewards);

  if (pool.length === 0) return null;

  if (honesty || naming || courage || primaryEmotion) {
    return pickDeterministic(pool, `${gateSeed}-${pool.length}`);
  }

  return null;
}

