import type { EmotionalState } from "@/lib/realtime/emotion/state";
import { clampEmotionalState } from "@/lib/realtime/emotion/state";
import type { HealthState } from "./state";

export function updateHealthState(
  prev: HealthState,
  emotionalState: EmotionalState,
  assistantText: string | null | undefined,
): HealthState {
  const now = Date.now();
  let next: HealthState = { ...prev, lastUpdate: now };

  next.driftScore += Math.abs(emotionalState.tension - 0.2) * 0.3;
  next.driftScore += Math.abs(emotionalState.arousal - 0.3) * 0.2;

  next.fatigue += emotionalState.tension * 0.05;

  next.tensionLoad = Math.min(1, next.tensionLoad + emotionalState.tension * 0.1);

  if (assistantText && assistantText.length < 4) {
    next.clarity = Math.max(0, next.clarity - 0.2);
  } else {
    next.clarity = Math.min(1, next.clarity + 0.05);
  }

  // keep bounds sane
  next.driftScore = Math.max(0, next.driftScore);
  next.fatigue = Math.max(0, next.fatigue);

  return next;
}

export function applyHealthGuardrails(
  health: HealthState,
  state: EmotionalState,
): EmotionalState {
  let patched = { ...state };
  if (health.driftScore > 3) {
    patched.arousal -= 0.2;
    patched.tension -= 0.2;
  }
  if (health.fatigue > 1) {
    patched.curiosity -= 0.15;
  }
  if (health.tensionLoad > 0.8) {
    patched.tension -= 0.15;
  }
  return clampEmotionalState(patched);
}

