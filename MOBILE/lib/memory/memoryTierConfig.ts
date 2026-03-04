/**
 * Phase 2: Memory Tier Configuration
 * Defines retrieval depth and capabilities per subscription tier.
 * Enforces strict caps: time windows, chunk counts, character budgets.
 */

import { UnknownTierError, isValidPlanTier } from "@/lib/plans/defaultEntitlements";

export type MemoryTier = "free" | "pro" | "elite";

export type MemoryTierConfig = {
  /** Enable vector similarity search (disabled = recency-only) */
  useSimilarity: boolean;
  /** Maximum number of chunks to retrieve */
  maxChunks: number;
  /** Maximum total characters across all excerpts */
  maxCharsTotal: number;
  /** Recency window in days (null = unlimited/full history) */
  recencyDaysCap: number | null;
  /** Hard cap on candidate pool size for retrieval */
  candidatePoolLimit: number;
};

/**
 * Tier-based memory retrieval configuration.
 * These are HARD limits enforced at the retrieval layer.
 */
export const MEMORY_TIER_CONFIG: Record<MemoryTier, MemoryTierConfig> = {
  free: {
    useSimilarity: false,     // Recency-only for free tier
    maxChunks: 3,             // Minimal context
    maxCharsTotal: 800,       // Small token budget
    recencyDaysCap: 30,       // 30-day hard window
    candidatePoolLimit: 30,   // Limited candidate pool
  },
  pro: {
    useSimilarity: true,      // Vector similarity enabled
    maxChunks: 6,             // Moderate context
    maxCharsTotal: 1500,      // Standard token budget
    recencyDaysCap: 90,       // 90-day window
    candidatePoolLimit: 100,  // Moderate candidate pool
  },
  elite: {
    useSimilarity: true,      // Vector similarity enabled
    maxChunks: 18,            // Deep context
    maxCharsTotal: 4000,      // Large token budget
    recencyDaysCap: null,     // Full historical access
    candidatePoolLimit: 300,  // Large candidate pool
  },
};

/**
 * Get configuration for a specific tier.
 * Falls back to free tier for unknown tiers.
 */
export function getMemoryTierConfig(tier: MemoryTier | string): MemoryTierConfig {
  if (isValidPlanTier(tier)) {
    return MEMORY_TIER_CONFIG[tier];
  }
  throw new UnknownTierError(String(tier), "getMemoryTierConfig");
}

/**
 * Check if a chunk is within the tier's recency window.
 * Returns true if the chunk should be included.
 */
export function isWithinRecencyWindow(
  createdAtISO: string,
  recencyDaysCap: number | null,
  now: number = Date.now()
): boolean {
  // No cap = unlimited access (elite tier)
  if (recencyDaysCap === null) return true;
  
  const ageMs = now - new Date(createdAtISO).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  
  return ageDays <= recencyDaysCap;
}

/**
 * Apply tier-based time filter to candidate chunks.
 * Must be called BEFORE similarity scoring.
 */
export function filterByRecencyWindow<T extends { created_at: string }>(
  chunks: T[],
  recencyDaysCap: number | null,
  now: number = Date.now()
): T[] {
  if (recencyDaysCap === null) return chunks; // No filtering for elite
  
  return chunks.filter((chunk) => 
    isWithinRecencyWindow(chunk.created_at, recencyDaysCap, now)
  );
}
