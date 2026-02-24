import type { SessionState, EmotionIntelBundle } from "@/lib/ai/types";
import type { MemoryProfile, TonePreference } from "@/lib/memory/types";

function intensityKeyword(score: number) {
  if (score >= 8) return "very strong";
  if (score >= 6) return "strong";
  if (score >= 3) return "clear";
  return "subtle";
}

function directed(list: string[]) {
  return list.map((line) => line.replace("?", "").trim() + "?");
}

export function deriveEmotionalContinuity(params: {
  sessionState: SessionState | null;
  emotionIntel: EmotionIntelBundle | null;
  tone: TonePreference;
  memory: MemoryProfile | null;
}): string | null {
  const { sessionState, emotionIntel, tone, memory } = params;

  if (!sessionState || !emotionIntel) return null;

  const primary = emotionIntel?.emotion?.primaryEmotion ?? null;
  if (!primary) return null;

  const intensity = intensityKeyword((emotionIntel.emotion as any)?.intensity ?? 3);
  const phase = sessionState.phase;
  const bias = memory?.styleBias ?? {
    warm: 1,
    direct: 1,
    stoic: 1,
    soft: 1,
  };

  const gentle = [
    "You sound a little more aware of this feeling than earlier. Does it feel that way?",
    "It seems like the emotional weight shifted slightly as we talked. How does it feel now?",
    "There’s a softness around this feeling that wasn’t there at the start. What changed?",
  ];

  const reflective = [
    "It feels like the tension you mentioned earlier is evolving. What do you sense shifting?",
    "There’s a clearer shape to this emotion now than at the beginning. What stands out to you?",
    "We're moving from the surface toward something deeper. Is that how it feels for you?",
  ];

  const stoic = [
    "There’s a clearer distinction now between what’s in your control and what isn’t. How does that feel?",
    "Your tone seems more aligned with acceptance than earlier. Does that resonate?",
    "It sounds like you're seeing the situation with more steadiness than before.",
  ];

  const calm = [
    "Your words feel a bit more grounded than when we began. Do you notice that?",
    "The emotional tone here feels steadier than earlier. What's that like for you?",
    "It seems like you’re settling into the feeling rather than fighting it.",
  ];

  let pool: string[] = [];

  if (phase === "opening") pool.push(...gentle);
  if (phase === "exploring") pool.push(...reflective, ...gentle);
  if (phase === "clarifying") pool.push(...reflective, ...stoic);
  if (phase === "deciding") pool.push(...stoic, ...directed(reflective));
  if (phase === "integrating") pool.push(...calm, ...stoic);

  if (tone === "soft") pool.push(...calm);
  if (tone === "warm") pool.push(...gentle);
  if (tone === "direct") pool.push(...reflective);
  if (tone === "stoic") pool.push(...stoic);

  if (bias.warm > bias.direct && bias.warm > bias.stoic) {
    pool.push(...gentle);
  }
  if (bias.direct > bias.warm) {
    pool.push(...reflective);
  }
  if (bias.stoic > bias.warm) {
    pool.push(...stoic);
  }
  if (bias.soft > bias.direct) {
    pool.push(...calm);
  }

  if (pool.length === 0) return null;
  const seed =
    (sessionState.turnsInPhase ?? 0) +
    (sessionState.totalTurns ?? 0) +
    intensity.length +
    (primary?.length ?? 0);
  const index = Math.abs(seed) % pool.length;
  return pool[index];
}

