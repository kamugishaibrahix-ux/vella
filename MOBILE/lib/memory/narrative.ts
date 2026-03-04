/**
 * Phase 3: Long-Term Narrative Memory Layer
 * Builds narrative context from consolidated snapshots and episodic clusters.
 * Injected BEFORE recent memory in prompts for users with Deep Memory enabled.
 * 
 * Architecture:
 * - Entitlement-gated: enableDeepMemory
 * - Sources: memory_snapshots + memory_clusters
 * - Format: Structured narrative block for prompt injection
 * - Token budget: Part of Elite's 4000 char memory budget
 * 
 * CRITICAL: Uses enableDeepMemory entitlement, NOT tier strings.
 */

import { getMemoryTierConfig, type MemoryTier } from "@/lib/memory/memoryTierConfig";
import { listMemorySnapshots, type MemorySnapshotRecord } from "@/lib/memory/consolidation";
import { listMemoryClusters, type MemoryClusterRecord } from "@/lib/memory/clustering";
import { isDeepMemoryEnabled } from "@/lib/plans/featureRegistry";
import type { PlanEntitlement } from "@/lib/plans/types";

// Configuration - based on enableDeepMemory entitlement, NOT tier
const NARRATIVE_CONFIG = {
  enabled: {
    maxSnapshots: 3,      // Include up to 3 consolidated snapshots
    maxClusters: 5,       // Include up to 5 episodic clusters
    maxTotalChars: 1500, // Budget within Elite's 4000 char total
  },
  disabled: {
    maxSnapshots: 0,      // No narrative layer
    maxClusters: 0,
    maxTotalChars: 0,
  },
};

export type NarrativeMemoryContext = {
  /** The formatted narrative block for prompt injection */
  narrativeBlock: string;
  /** Character count of narrative block */
  charCount: number;
  /** Token estimate (chars/4) */
  tokenEstimate: number;
  /** Sources included */
  sources: {
    snapshots: number;
    clusters: number;
  };
  /** Whether narrative was generated (false when Deep Memory disabled) */
  hasNarrative: boolean;
};

/**
 * Build narrative memory context for a user.
 * Deep Memory only - returns empty context when enableDeepMemory is false.
 * 
 * Narrative is placed BEFORE recent memory in prompts to establish
 * long-term context before specific recent details.
 * 
 * @param userId - The user ID
 * @param entitlements - User's entitlements (enableDeepMemory determines availability)
 */
export async function buildNarrativeMemoryContext(
  userId: string,
  entitlements: PlanEntitlement
): Promise<NarrativeMemoryContext> {
  // Entitlement gate: Deep Memory enabled
  if (!isDeepMemoryEnabled(entitlements)) {
    return {
      narrativeBlock: "",
      charCount: 0,
      tokenEstimate: 0,
      sources: { snapshots: 0, clusters: 0 },
      hasNarrative: false,
    };
  }
  
  const config = NARRATIVE_CONFIG.enabled;
  
  // Fetch structured memory sources (Deep Memory enabled implies full access)
  // Pass entitlements for PURE abstraction gating (no tier strings)
  const [snapshots, clusters] = await Promise.all([
    listMemorySnapshots(userId, "elite", entitlements, config.maxSnapshots),
    listMemoryClusters(userId, "elite", entitlements, config.maxClusters),
  ]);
  
  // If no structured memory yet, return empty
  if (snapshots.length === 0 && clusters.length === 0) {
    return {
      narrativeBlock: "",
      charCount: 0,
      tokenEstimate: 0,
      sources: { snapshots: 0, clusters: 0 },
      hasNarrative: false,
    };
  }
  
  // Build narrative sections
  const sections: string[] = [];
  let usedChars = 0;
  
  // 1. Long-term trajectory (from snapshots)
  if (snapshots.length > 0) {
    const snapshotSection = formatSnapshotSection(snapshots);
    if (usedChars + snapshotSection.length <= config.maxTotalChars) {
      sections.push(snapshotSection);
      usedChars += snapshotSection.length;
    }
  }
  
  // 2. Episodic themes (from clusters)
  if (clusters.length > 0 && usedChars < config.maxTotalChars) {
    const remainingBudget = config.maxTotalChars - usedChars;
    const clusterSection = formatClusterSection(clusters, remainingBudget);
    if (clusterSection.length > 0) {
      sections.push(clusterSection);
      usedChars += clusterSection.length;
    }
  }
  
  // 3. Dominant long-term themes (extracted from both)
  if (snapshots.length > 0 || clusters.length > 0) {
    const themesSection = formatThemesSection(snapshots, clusters);
    if (usedChars + themesSection.length <= config.maxTotalChars) {
      sections.push(themesSection);
      usedChars += themesSection.length;
    }
  }
  
  const narrativeBlock = sections.join("\n\n");
  
  return {
    narrativeBlock,
    charCount: usedChars,
    tokenEstimate: Math.ceil(usedChars / 4),
    sources: {
      snapshots: snapshots.length,
      clusters: clusters.length,
    },
    hasNarrative: true,
  };
}

/**
 * Format snapshot section for narrative.
 */
function formatSnapshotSection(snapshots: MemorySnapshotRecord[]): string {
  const lines: string[] = [
    "───────────────────────────────────────",
    "LONG-TERM TRAJECTORY (Consolidated Memory)",
    "───────────────────────────────────────",
  ];
  
  for (const snapshot of snapshots) {
    const periodLabel = formatPeriod(snapshot.periodStart, snapshot.periodEnd);
    const themes = snapshot.dominantThemes.slice(0, 3).join(", ");
    
    lines.push(`• ${periodLabel}: ${snapshot.sourceChunkCount} entries → themes: ${themes}`);
    
    if (snapshot.emotionalTone) {
      lines.push(`  Tone: ${snapshot.emotionalTone}`);
    }
  }
  
  return lines.join("\n");
}

/**
 * Format cluster section for narrative.
 */
function formatClusterSection(clusters: MemoryClusterRecord[], budget: number): string {
  const lines: string[] = [
    "───────────────────────────────────────",
    "EPISODIC PATTERNS (Recent Themes)",
    "───────────────────────────────────────",
  ];
  
  let usedChars = lines.join("\n").length;
  
  for (const cluster of clusters) {
    const periodLabel = formatPeriod(cluster.timeRangeStart, cluster.timeRangeEnd);
    const line = `• ${cluster.dominantTheme} (${periodLabel}, ${cluster.memberCount} entries)`;
    
    if (usedChars + line.length + 1 <= budget) {
      lines.push(line);
      usedChars += line.length + 1;
      
      // Add secondary themes if budget allows
      if (cluster.secondaryThemes.length > 0) {
        const secondaryLine = `  Related: ${cluster.secondaryThemes.join(", ")}`;
        if (usedChars + secondaryLine.length + 1 <= budget) {
          lines.push(secondaryLine);
          usedChars += secondaryLine.length + 1;
        }
      }
    } else {
      break;
    }
  }
  
  return lines.join("\n");
}

/**
 * Format dominant themes section.
 */
function formatThemesSection(
  snapshots: MemorySnapshotRecord[],
  clusters: MemoryClusterRecord[]
): string {
  // Aggregate themes from both sources
  const themeCounts = new Map<string, number>();
  
  for (const snapshot of snapshots) {
    for (const theme of snapshot.dominantThemes) {
      themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    }
  }
  
  for (const cluster of clusters) {
    themeCounts.set(
      cluster.dominantTheme, 
      (themeCounts.get(cluster.dominantTheme) ?? 0) + 1
    );
    for (const theme of cluster.secondaryThemes) {
      themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 0.5);
    }
  }
  
  // Get top themes
  const topThemes = Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme]) => theme);
  
  if (topThemes.length === 0) return "";
  
  return [
    "───────────────────────────────────────",
    "DOMINANT LONG-TERM THEMES",
    "───────────────────────────────────────",
    `Recurring focus: ${topThemes.join(" → ")}`,
  ].join("\n");
}

/**
 * Format a time period for display.
 */
function formatPeriod(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  
  const format = (d: Date) => 
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  
  const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  
  if (days <= 1) {
    return format(start);
  } else if (days <= 7) {
    return `${format(start)} to ${format(end)} (${days} days)`;
  } else {
    return `${format(start)} to ${format(end)}`;
  }
}

/**
 * Calculate total memory context size including narrative + recent chunks.
 * Used for token estimation.
 */
export function calculateTotalMemorySize(
  narrativeContext: NarrativeMemoryContext,
  recentMemoryChars: number
): number {
  return narrativeContext.charCount + recentMemoryChars;
}

/**
 * Format complete memory context with narrative before recent memory.
 * This is the entry point for prompt injection.
 * 
 * Structure:
 * 1. Narrative layer (Elite only) - long-term context
 * 2. Recent memory - specific recent chunks
 */
export function formatCompleteMemoryContext(
  narrativeContext: NarrativeMemoryContext,
  recentMemoryContext: string
): string {
  const parts: string[] = [];
  
  // Phase 3: Narrative layer comes FIRST (establishes long-term context)
  if (narrativeContext.hasNarrative && narrativeContext.narrativeBlock) {
    parts.push(narrativeContext.narrativeBlock);
  }
  
  // Recent specific memory comes AFTER narrative
  if (recentMemoryContext) {
    parts.push(recentMemoryContext);
  }
  
  return parts.join("\n\n");
}
