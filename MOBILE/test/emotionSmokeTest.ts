import { updateEmotionalState } from "@/lib/realtime/emotion/engine";
import {
  createBaselineEmotionalState,
  type RelationshipMode,
  type EmotionalState,
} from "@/lib/realtime/emotion/state";

type Scenario = {
  label: string;
  text: string;
  options?: Partial<{
    distressScore: number;
    isHeavyTopic: boolean;
    isUser: boolean;
  }>;
};

const relationshipMode: RelationshipMode = "best_friend";

const scenarios: Scenario[] = [
  {
    label: "Positive turn",
    text: "I feel really grateful and proud of how today went. Things are looking up!",
  },
  {
    label: "Negative turn",
    text: "Everything hurts and I feel defeated. I'm just overwhelmed.",
  },
  {
    label: "Distress spike",
    text: "I'm panicking and can't calm down. Please help me breathe.",
    options: { distressScore: 0.85, isHeavyTopic: true },
  },
  {
    label: "Neutral grounding",
    text: "Let's take a breath and map what actually happened step by step.",
    options: { isHeavyTopic: false },
  },
];

function ensureDeltaCaps(prev: EmotionalState, next: EmotionalState) {
  const deltas = {
    valence: Math.abs(next.valence - prev.valence),
    arousal: Math.abs(next.arousal - prev.arousal),
    warmth: Math.abs(next.warmth - prev.warmth),
    curiosity: Math.abs(next.curiosity - prev.curiosity),
    tension: Math.abs(next.tension - prev.tension),
  };
  const caps = {
    valence: 0.35,
    arousal: 0.25,
    warmth: 0.45,
    curiosity: 0.3,
    tension: 0.4,
  };
  (Object.keys(deltas) as Array<keyof typeof deltas>).forEach((key) => {
    if (deltas[key] > caps[key]) {
      throw new Error(`Delta for ${key} exceeded cap (${deltas[key].toFixed(3)} > ${caps[key]})`);
    }
  });
}

function runSmokeTest() {
  let state = createBaselineEmotionalState(relationshipMode);
  console.log("[Phase17] Baseline:", state);

  scenarios.forEach((scenario, index) => {
    const prev = state;
    state = updateEmotionalState(state, {
      text: scenario.text,
      isUser: scenario.options?.isUser ?? true,
      relationshipMode,
      distressScore: scenario.options?.distressScore,
      isHeavyTopic: scenario.options?.isHeavyTopic,
      turnIndex: index,
    });
    ensureDeltaCaps(prev, state);
    console.log(`[Phase17] ${scenario.label}:`, state);
  });

  const future = Date.now() + 45_000;
  const decayed = updateEmotionalState(
    state,
    {
      text: " ",
      isUser: false,
      relationshipMode,
      now: future,
    },
  );
  console.log("[Phase17] Decayed toward baseline:", decayed);
}

runSmokeTest();

