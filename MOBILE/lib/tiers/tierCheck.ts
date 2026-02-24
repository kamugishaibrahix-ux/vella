// Summary: Centralizes feature-to-plan permissions and upgrade messaging helpers.
export type PlanTier = "free" | "pro" | "elite";

export const FEATURE_MAP: Record<string, PlanTier[]> = {
  story_short: ["free", "pro", "elite"],
  story_long: ["pro", "elite"],
  voice_quick: ["pro", "elite"],
  voice_long: ["elite"],
  deep_emotion: ["pro", "elite"],
  long_advice: ["pro", "elite"],
  checkin: ["free", "pro", "elite"],
  journal: ["free", "pro", "elite"],
  insight: ["free", "pro", "elite"],
  journal_analysis_summary: ["pro", "elite"],
  journal_analysis_meaning: ["pro", "elite"],
  journal_analysis_lesson: ["pro", "elite"],
  forecasting: ["pro", "elite"],
  nudge_intelligence: ["pro", "elite"],
  mode_default: ["free", "pro", "elite"],
  mode_clarity: ["free", "pro", "elite"],
  mode_mindset_reset: ["free", "pro", "elite"],
  mode_deep_reflection: ["pro", "elite"],
  mode_execution_coach: ["pro", "elite"],
  mode_stoic_mentor: ["pro", "elite"],
  mode_behaviour_analysis: ["pro", "elite"],
  audio_ambient: ["pro", "elite"],
  audio_meditation: ["pro", "elite"],
  audio_mood: ["pro", "elite"],
  audio_singing: ["elite"],
  voice_long_session: ["elite"],
  custom_modes: ["elite"],
  priority_routing: ["elite"],
  quarterly_deep_dives: ["elite"],
};

export const UPGRADE_MESSAGE = `
I’d love to do that with you, but it’s part of a higher plan.
If you upgrade, I can give you the full version of this experience.
Would you like to see the options?
`.trim();

export function isFeatureAllowed(plan: PlanTier, feature: string): boolean {
  const allowed = FEATURE_MAP[feature];
  if (!allowed) return true;
  return allowed.includes(plan);
}

export function getUpgradeBlock(plan: PlanTier, feature: string): string | null {
  return isFeatureAllowed(plan, feature) ? null : UPGRADE_MESSAGE;
}


