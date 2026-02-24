"use server";

import { runFullAI } from "@/lib/ai/fullAI";
import type { TraitScores } from "@/lib/traits/adaptiveTraits";
import type { BehaviourLoop } from "@/lib/loops/getBehaviourLoops";
import type { CognitiveDistortion } from "@/lib/insights/cognitiveDistortions";
import type { LifeTheme } from "@/lib/insights/lifeThemes";
import type { UserGoal } from "@/lib/goals/goalEngine";
import type { EmotionalPatternSummary } from "@/lib/insights/patterns";

export type RegulationStrategy = {
  id: string;
  name: string;
  category: string;
  difficulty: string;
  description: string;
  whenToUse: string;
  personalisedNote?: string;
};

type StrategyContext = {
  patterns: EmotionalPatternSummary | null;
  loops: BehaviourLoop[];
  distortions: CognitiveDistortion[];
  traits: TraitScores | null;
  themes: LifeTheme[];
  goals: {
    life: UserGoal[];
    focus: UserGoal[];
  };
};

const SYSTEM_PROMPT = `
You are Vella, an emotionally intelligent guide. Generate personalised emotional regulation strategies
based on the user's emotional patterns, behaviour loops, cognitive distortions, current traits, themes,
and goals. Respond strictly with JSON:
{
  "strategies": [
    {
      "id": "string",
      "name": "string",
      "category": "breathing|body|thinking|stoic|journaling|habits",
      "difficulty": "micro|light|deep",
      "description": "what to do",
      "whenToUse": "when this strategy is helpful",
      "personalisedNote": "optional"
    }
  ]
}
Strategies must be practical, compassionate, and tailored to the context.
`.trim();

export async function generateRegulationStrategies(
  context: StrategyContext,
): Promise<RegulationStrategy[]> {
  try {
    const response = await runFullAI({
      system: SYSTEM_PROMPT,
      temperature: 0.25,
      messages: [
        {
          role: "user",
          content: JSON.stringify(context, null, 2),
        },
      ],
    });
    const parsed = parseStrategyResponse(response);
    if (parsed.length > 0) {
      return parsed;
    }
  } catch (error) {
    console.error("[generateRegulationStrategies] AI error", error);
  }
  return buildFallbackStrategies(context);
}

function parseStrategyResponse(response: string): RegulationStrategy[] {
  try {
    const data = JSON.parse(response);
    const list: unknown[] = Array.isArray(data?.strategies)
      ? data.strategies
      : Array.isArray(data)
        ? data
        : [];
    return list
      .map((item, index) => sanitizeStrategy(item, index))
      .filter((item): item is RegulationStrategy => Boolean(item));
  } catch (error) {
    console.error("[generateRegulationStrategies] parse error", error);
    return [];
  }
}

function sanitizeStrategy(raw: unknown, index: number): RegulationStrategy | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const rawName = record.name;
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;
  const rawDescription = record.description;
  const description =
    typeof rawDescription === "string" && rawDescription.trim() ? rawDescription.trim() : null;
  const rawWhenToUse = record.whenToUse;
  const whenToUse =
    typeof rawWhenToUse === "string" && rawWhenToUse.trim() ? rawWhenToUse.trim() : null;
  if (!name || !description || !whenToUse) return null;
  const category =
    typeof record.category === "string"
      ? record.category.toLowerCase()
      : "breathing";
  const difficulty =
    typeof record.difficulty === "string"
      ? record.difficulty.toLowerCase()
      : "light";
  return {
    id: typeof record.id === "string" ? record.id : `strategy-${index}`,
    name,
    category,
    difficulty,
    description,
    whenToUse,
    personalisedNote:
      typeof record.personalisedNote === "string" ? record.personalisedNote : undefined,
  };
}

function buildFallbackStrategies(context: StrategyContext): RegulationStrategy[] {
  const strategies: RegulationStrategy[] = [];
  const patternSnippets = flattenEmotionalPatterns(context.patterns);

  strategies.push({
    id: "breath-grounding",
    name: "4-7-8 Grounding",
    category: "breathing",
    difficulty: "micro",
    description: "Inhale for 4 counts, hold for 7, exhale for 8 while you rest a hand on your chest.",
    whenToUse: "Use when heart rate spikes or mind loops late at night.",
    personalisedNote: patternSnippets[0] ?? "Helps when anxiety rises faster than calm.",
  });

  if (context.loops.some((loop) => /avoid|overthinking/i.test(loop.loop))) {
    strategies.push({
      id: "body-reset",
      name: "Sensory Reset Walk",
      category: "body",
      difficulty: "light",
      description: "Walk slowly and name five details you can see, four you can touch, three you can hear.",
      whenToUse: "Use when you notice avoidance or overthinking loops grabbing your focus.",
    });
  }

  if (context.distortions.length > 0) {
    strategies.push({
      id: "cognitive-reframe",
      name: "Thought Reframe Checkpoint",
      category: "thinking",
      difficulty: "light",
      description: "Write the thought, label the distortion you see, and rewrite it as a balanced statement.",
      whenToUse: `Use when ${context.distortions[0].type.toLowerCase()} starts dominating your self-talk.`,
    });
  }

  strategies.push({
    id: "stoic-zoom",
    name: "Stoic Zoom-Out",
    category: "stoic",
    difficulty: "light",
    description: "Picture the same situation a year from now and ask what future-you would advise.",
    whenToUse: "Use when emotions swell and you need perspective before responding.",
  });

  strategies.push({
    id: "journaling-truth",
    name: "Three Lines of Truth",
    category: "journaling",
    difficulty: "deep",
    description: "Line 1: What happened. Line 2: How it feels in your body. Line 3: What you need now.",
    whenToUse: "Use after intense conversations or when you feel overwhelmed by mixed emotions.",
  });

  return strategies;
}

function flattenEmotionalPatterns(summary: EmotionalPatternSummary | null | undefined): string[] {
  if (!summary?.patterns) return [];
  const { commonPrimaryEmotions = [], commonTriggers = [], commonFears = [], emotionalTendencies = [] } =
    summary.patterns;
  return [...commonPrimaryEmotions, ...commonTriggers, ...commonFears, ...emotionalTendencies].filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

