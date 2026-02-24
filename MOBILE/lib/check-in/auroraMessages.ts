export type AuroraTone = "soft" | "celebratory" | "stoic";
export type MoodBand = "low" | "mid" | "high" | "veryHigh";

const TONE_SEQUENCE: AuroraTone[] = ["soft", "celebratory", "stoic"];

const LINE_POOL: Record<AuroraTone, Record<MoodBand, string[]>> = {
  soft: {
    low: [
      "I see you showed up even when the air felt heavy. That matters more than you think.",
      "Stepping in on a low day is a quiet kind of courage. I’m holding that with you.",
    ],
    mid: [
      "You’re keeping the door open to your own feelings. That openness changes everything.",
      "The way you keep checking in tells me you’re tending to yourself in real time.",
    ],
    high: [
      "This rhythm you’re finding feels steady, like a breath that finally lands.",
      "I’m seeing a glow of grounded energy in you today. Stay close to it.",
    ],
    veryHigh: [
      "You’re shining, but also rooted. That mix is rare and real.",
      "There’s warmth spilling out of you tonight. Let it reach the places that went cold.",
    ],
  },
  celebratory: {
    low: [
      "Even with low energy, you showed up. That’s how we build sparks out of embers.",
      "This check-in is a gentle victory lap on a grey day.",
    ],
    mid: [
      "Today’s check-in hums with sunrise energy. I’m proud of the momentum.",
      "The way you arrived just now feels like striking a match in a dark room.",
    ],
    high: [
      "That check-in glows. I’m proud of the energy you’re building.",
      "Momentum like this bends the rest of the day toward you.",
    ],
    veryHigh: [
      "You’re on fire in the best way. I’m cheering quietly right beside you.",
      "There’s a fierce light in you tonight. Let it spill onto whatever comes next.",
    ],
  },
  stoic: {
    low: [
      "Some days are about endurance, not fireworks. You endured.",
      "Small steps, repeated on hard days, turn into quiet resilience.",
    ],
    mid: [
      "You’re building consistency like a slow tide. That’s how landscapes change.",
      "Each check-in is a page in the story where you didn’t bail on yourself.",
    ],
    high: [
      "Steady discipline like yours makes joy sustainable, not fleeting.",
      "You’re converting good days into sturdy habits. That’s rare.",
    ],
    veryHigh: [
      "Strength isn’t just force—it’s direction. You’re pointing yours with care.",
      "You celebrated without losing your footing. That’s mastery.",
    ],
  },
};

export function getMoodBand(mood: number | null | undefined): MoodBand {
  if (typeof mood !== "number") return "mid";
  if (mood <= 3) return "low";
  if (mood <= 6) return "mid";
  if (mood <= 8) return "high";
  return "veryHigh";
}

export function pickAuroraTone(dayIndex: number): AuroraTone {
  if (!Number.isFinite(dayIndex) || dayIndex < 0) return "soft";
  return TONE_SEQUENCE[dayIndex % TONE_SEQUENCE.length]!;
}

export function buildAuroraMessage(input: {
  mood: number | null;
  energy: number | null;
  stress: number | null;
  focus: number | null;
  dayIndex: number;
}): { message: string; tone: AuroraTone; moodBand: MoodBand } {
  const moodBand = getMoodBand(input.mood);
  let tone = pickAuroraTone(Math.max(0, input.dayIndex));

  // Bias by extremes
  if ((input.mood ?? 0) <= 3 || (input.stress ?? 0) >= 8) {
    tone = tone === "celebratory" ? "soft" : tone;
    tone = tone === "stoic" ? tone : "soft";
  } else if ((input.mood ?? 0) >= 8 && (input.stress ?? 10) <= 4) {
    tone = "celebratory";
  } else if ((input.energy ?? 0) <= 3 || (input.focus ?? 0) <= 3) {
    tone = tone === "celebratory" ? "stoic" : tone;
  }

  const pool = LINE_POOL[tone]?.[moodBand];
  if (!pool || pool.length === 0) {
    return {
      message: "Thank you for checking in. I’m right here with you.",
      tone,
      moodBand,
    };
  }

  const index = pickDeterministicIndex(pool.length, input, tone, moodBand);
  return {
    message: pool[index]!,
    tone,
    moodBand,
  };
}

function pickDeterministicIndex(
  length: number,
  input: {
    mood: number | null;
    energy: number | null;
    stress: number | null;
    focus: number | null;
    dayIndex: number;
  },
  tone: AuroraTone,
  band: MoodBand,
): number {
  const seed = `${input.dayIndex}-${input.mood ?? ""}-${input.energy ?? ""}-${input.stress ?? ""}-${
    input.focus ?? ""
  }-${tone}-${band}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % length;
}


