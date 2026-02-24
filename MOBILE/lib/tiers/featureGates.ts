"use client";

export type PlanTier = "free" | "pro" | "elite";

export function isVoiceEnabled(tier: PlanTier): boolean {
  return tier === "pro" || tier === "elite";
}

export function isMusicModeEnabled(tier: PlanTier): boolean {
  return tier === "elite";
}

// Story Mode is available to all tiers,
// but deeper branches are premium.
// UI should not block base access.
export function storyModePremiumFeaturesEnabled(tier: PlanTier): boolean {
  return tier !== "free"; // Pro & Elite
}

