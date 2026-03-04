/**
 * UI Tier Model
 * Single source of truth for converting plan entitlements to human-readable UI labels.
 * 
 * This is the ONLY place that maps entitlements to display text.
 * All UI components (UpgradeModal, UpgradePage, Profile, Settings) must use this.
 * 
 * Deep Memory Rule:
 * - Elite: "Deep Memory (full local history context)" - INCLUDED
 * - Pro: "Deep Memory" - shown as locked/absent
 * - Free: "Deep Memory" - shown as locked/absent
 */

import type { PlanTier, PlanEntitlement } from "./types";

// Re-export PlanTier for convenience
export type { PlanTier };

/**
 * Feature bullet for UI display.
 */
export interface FeatureBullet {
  label: string;
  included: boolean;
  highlight?: boolean; // For "Most Popular" or exclusive features
}

/**
 * Complete tier display model.
 * Used by all UI components for consistent rendering.
 */
export interface TierDisplayModel {
  tier: PlanTier;
  title: string;
  subtitle: string;
  priceLabel: string;
  priceSubtext: string;
  tokensPerMonth: number;
  formattedTokens: string;
  isPopular: boolean;
  bullets: FeatureBullet[];
  featureMatrix: FeatureMatrixRow[];
  ctaLabel: string;
  ctaDisabled: boolean;
  badge?: string;
}

/**
 * Row in a feature comparison matrix.
 */
export interface FeatureMatrixRow {
  feature: string;
  free: string | boolean;
  pro: string | boolean;
  elite: string | boolean;
  isDeepMemory?: boolean; // Special flag for Deep Memory row
}

/**
 * Format token number for display (30k, 300k, 1M).
 */
function formatTokens(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(0)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}k`;
  return num.toString();
}

/**
 * Build bullets from entitlements.
 * Deep Memory is ONLY included for Elite.
 */
function buildBullets(tier: PlanTier, entitlements: PlanEntitlement): FeatureBullet[] {
  const bullets: FeatureBullet[] = [
    {
      label: `${formatTokens(entitlements.maxMonthlyTokens)} text tokens / month`,
      included: true,
    },
  ];

  // Voice features
  if (entitlements.enableRealtime) {
    bullets.push({ label: "Realtime voice conversations", included: true });
  }
  if (entitlements.enableVoiceTTS) {
    bullets.push({ label: "Voice generation (TTS)", included: true });
  }
  if (entitlements.enableAudioVella) {
    bullets.push({ label: "AI audio generation", included: true });
  }

  // AI features
  if (entitlements.enableArchitect) {
    bullets.push({ label: "Life Architect AI planning", included: true });
  }
  if (entitlements.enableDeepDive) {
    bullets.push({ label: "Deep Dive analysis", included: true });
  }
  if (entitlements.enableGrowthRoadmap) {
    bullets.push({ label: "Growth Roadmap", included: true });
  }

  // Deep Memory - ELITE ONLY
  if (entitlements.enableDeepInsights) {
    bullets.push({
      label: "Deep Memory (full local history context)",
      included: true,
      highlight: true,
    });
  } else {
    // Show Deep Memory as locked for Pro and Free
    bullets.push({
      label: tier === "pro" ? "Deep Memory (Elite only)" : "Deep Memory",
      included: false,
    });
  }

  return bullets;
}

/**
 * Build feature comparison matrix.
 * Deep Memory row shows Elite-exclusive status.
 * Token values are dynamically formatted from entitlements.
 */
function buildFeatureMatrix(allEntitlements?: Record<PlanTier, PlanEntitlement>): FeatureMatrixRow[] {
  // Use dynamic values if entitlements provided, otherwise use hardcoded defaults
  const freeTokens = allEntitlements?.free?.maxMonthlyTokens ?? 10_000;
  const proTokens = allEntitlements?.pro?.maxMonthlyTokens ?? 300_000;
  const eliteTokens = allEntitlements?.elite?.maxMonthlyTokens ?? 1_000_000;

  return [
    { feature: "Text tokens / month", free: formatTokens(freeTokens), pro: formatTokens(proTokens), elite: formatTokens(eliteTokens) },
    { feature: "Realtime voice", free: false, pro: true, elite: true },
    { feature: "Voice generation", free: false, pro: true, elite: true },
    { feature: "AI audio clips", free: false, pro: "30/mo", elite: "120/mo" },
    { feature: "Life Architect", free: false, pro: true, elite: true },
    { feature: "Deep Dive analysis", free: false, pro: true, elite: true },
    { feature: "Growth Roadmap", free: false, pro: true, elite: true },
    {
      feature: "Deep Memory",
      free: "—",
      pro: "—",
      elite: "✓ Full history",
      isDeepMemory: true,
    },
    { feature: "Rate limit", free: "5/min", pro: "30/min", elite: "60/min" },
  ];
}

/**
 * Get tier display model from entitlements.
 * This is the main entry point - all UI components use this.
 */
export function getTierDisplayModel(
  tier: PlanTier,
  entitlements: PlanEntitlement,
  currentTier?: PlanTier
): TierDisplayModel {
  const isCurrent = currentTier === tier;
  const isUpgrade = currentTier
    ? getTierOrder(tier) > getTierOrder(currentTier)
    : false;
  const isDowngrade = currentTier
    ? getTierOrder(tier) < getTierOrder(currentTier)
    : false;

  const tierConfig = TIER_UI_CONFIG[tier];

  return {
    tier,
    title: tierConfig.title,
    subtitle: tierConfig.subtitle,
    priceLabel: tierConfig.priceLabel,
    priceSubtext: tierConfig.priceSubtext,
    tokensPerMonth: entitlements.maxMonthlyTokens,
    formattedTokens: formatTokens(entitlements.maxMonthlyTokens),
    isPopular: tier === "pro",
    bullets: buildBullets(tier, entitlements),
    featureMatrix: buildFeatureMatrix({ free: entitlements, pro: entitlements, elite: entitlements }),
    ctaLabel: isCurrent ? "Current Plan" : isUpgrade ? "Upgrade" : isDowngrade ? "Downgrade" : "Select",
    ctaDisabled: isCurrent,
    badge: isCurrent ? "Current" : tier === "elite" ? "Best Value" : undefined,
  };
}

/**
 * Get display models for all three tiers.
 * Used by upgrade pages to render comparison.
 */
export function getAllTierDisplayModels(
  allEntitlements: Record<PlanTier, PlanEntitlement>,
  currentTier?: PlanTier
): TierDisplayModel[] {
  return (["free", "pro", "elite"] as PlanTier[]).map((tier) =>
    getTierDisplayModel(tier, allEntitlements[tier], currentTier)
  );
}

/**
 * Helper: Get numeric order for tier comparison.
 */
function getTierOrder(tier: PlanTier): number {
  return { free: 0, pro: 1, elite: 2 }[tier];
}

/**
 * Static UI configuration per tier.
 * Prices and descriptions that are marketing copy, not entitlements.
 */
const TIER_UI_CONFIG: Record<
  PlanTier,
  {
    title: string;
    subtitle: string;
    priceLabel: string;
    priceSubtext: string;
  }
> = {
  free: {
    title: "Free",
    subtitle: "Core journaling and chat",
    priceLabel: "$0",
    priceSubtext: "/ month",
  },
  pro: {
    title: "Pro",
    subtitle: "Full AI feature access",
    priceLabel: "$9",
    priceSubtext: "/ month",
  },
  elite: {
    title: "Elite",
    subtitle: "Maximum access + deep insights",
    priceLabel: "$29",
    priceSubtext: "/ month",
  },
};

/**
 * Get simple plan label.
 */
export function getPlanLabel(tier: PlanTier): string {
  return TIER_UI_CONFIG[tier].title;
}

/**
 * Get plan badge styles for consistent coloring.
 */
export function getPlanBadgeStyles(tier: PlanTier): {
  background: string;
  text: string;
  border: string;
} {
  switch (tier) {
    case "elite":
      return {
        background: "bg-gradient-to-r from-amber-100 to-orange-100",
        text: "text-amber-800",
        border: "border-amber-200",
      };
    case "pro":
      return {
        background: "bg-gradient-to-r from-blue-100 to-indigo-100",
        text: "text-blue-800",
        border: "border-blue-200",
      };
    case "free":
      return {
        background: "bg-neutral-100",
        text: "text-neutral-700",
        border: "border-neutral-200",
      };
  }
}
