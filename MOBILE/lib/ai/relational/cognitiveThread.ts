import type {
  ConversationTurn,
  SessionState,
  EmotionIntelBundle,
} from "@/lib/ai/types";
import type { MemoryProfile, TonePreference } from "@/lib/memory/types";

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
  let hash = 23;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % items.length;
  return items[index]!;
};

function extractAnchorPoints(text: string): string[] {
  const t = text.toLowerCase();
  const anchors: string[] = [];

  if (t.includes("i don't know")) anchors.push("uncertainty");
  if (t.includes("stuck")) anchors.push("being stuck");
  if (t.includes("confused")) anchors.push("confusion");
  if (t.includes("worried") || t.includes("anxious")) anchors.push("worry");
  if (t.includes("sad")) anchors.push("sadness");
  if (t.includes("angry")) anchors.push("anger");
  if (t.includes("tired") || t.includes("exhausted")) anchors.push("fatigue");
  if (t.includes("lost")) anchors.push("loss of direction");
  if (t.includes("avoid") || t.includes("avoidant")) anchors.push("avoidance");
  if (t.includes("fear") || t.includes("afraid")) anchors.push("fear");

  return anchors;
}

export function deriveCognitiveThread(params: {
  history: ConversationTurn[];
  sessionState: SessionState | null;
  emotionIntel: EmotionIntelBundle | null;
}): {
  coreThread: string | null;
  underlyingTension: string | null;
  emotionalDriver: string | null;
} {
  const { history, sessionState, emotionIntel } = params;

  const userMessages = history.filter((h) => h.role === "user");

  if (userMessages.length === 0) {
    return {
      coreThread: null,
      underlyingTension: null,
      emotionalDriver: null,
    };
  }

  const lastMsg = userMessages[userMessages.length - 1].content;
  const anchors = extractAnchorPoints(lastMsg);

  const emotionalDriver =
    emotionIntel?.emotion?.primaryEmotion ??
    emotionIntel?.emotion?.secondaryEmotions?.[0] ??
    null;

  let underlyingTension: string | null = null;

  if (anchors.includes("uncertainty")) {
    underlyingTension = "wanting clarity but fearing the outcome";
  }
  if (anchors.includes("being stuck")) {
    underlyingTension = "feeling trapped between options or emotions";
  }
  if (anchors.includes("avoidance")) {
    underlyingTension = "wanting closeness but protecting yourself through distance";
  }
  if (anchors.includes("fear")) {
    underlyingTension = "fear of loss, failure, or emotional exposure";
  }
  if (anchors.includes("loss of direction")) {
    underlyingTension = "search for direction or meaning";
  }

  const coreThread = underlyingTension || emotionalDriver || anchors[0] || null;

  return {
    coreThread,
    underlyingTension,
    emotionalDriver,
  };
}

export function generateCognitiveThreadReflection(params: {
  coreThread: string | null;
  underlyingTension: string | null;
  emotionalDriver: string | null;
  tone: TonePreference;
  sessionState: SessionState | null;
  memory: MemoryProfile | null;
}): string | null {
  const { coreThread, tone, sessionState, memory } = params;
  if (!coreThread) return null;
  const gateSeed = `${coreThread}-${sessionState?.totalTurns ?? 0}`;
  if (!stableChance(gateSeed, 0.3)) return null;

  const bias = memory?.styleBias ?? {
    warm: 1,
    direct: 1,
    stoic: 1,
    soft: 1,
  };

  const phase = sessionState?.phase ?? "opening";

  const warmReflections = [
    `It feels like something underneath this is connected to ${coreThread}. Does that resonate?`,
    `I sense a deeper layer in what you’re describing—something about ${coreThread}.`,
  ];

  const directReflections = [
    `It seems like the real tension here might be ${coreThread}.`,
    `I want to point out something: ${coreThread} appears to be the thread running through what you're saying.`,
  ];

  const stoicReflections = [
    `There seems to be a core thread here about ${coreThread}, especially around what’s in your control versus what isn’t.`,
    `The thread underneath this appears connected to ${coreThread}. How does that sit with you?`,
  ];

  const gentleReflections = [
    `I'm noticing a thread that might relate to ${coreThread}. How does that feel?`,
    `There’s a quiet theme here tied to ${coreThread}. What do you make of it?`,
  ];

  let pool: string[] = [];

  if (tone === "warm") pool.push(...warmReflections);
  if (tone === "direct") pool.push(...directReflections);
  if (tone === "stoic") pool.push(...stoicReflections);
  if (tone === "soft") pool.push(...gentleReflections);

  if (bias.warm > bias.direct) pool.push(...warmReflections);
  if (bias.direct > bias.warm) pool.push(...directReflections);
  if (bias.stoic > bias.warm) pool.push(...stoicReflections);
  if (bias.soft > bias.direct) pool.push(...gentleReflections);

  if (phase === "clarifying") pool.push(...directReflections, ...stoicReflections);
  if (phase === "exploring") pool.push(...gentleReflections, ...warmReflections);
  if (phase === "opening") pool.push(...gentleReflections);

  if (pool.length === 0) return null;

  const pickSeed = `${coreThread}-${tone}-${pool.length}`;
  return pickDeterministic(pool, pickSeed);
}

