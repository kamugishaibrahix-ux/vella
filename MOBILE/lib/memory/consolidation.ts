/**
 * Phase 3: Memory Consolidation
 * Summarizes older memory chunks into consolidated snapshots.
 * Deep Memory feature (enableDeepMemory entitlement). No raw content stored server-side.
 * 
 * Architecture:
 * - Chunks exceeding threshold are summarized (locally)
 * - Summary metadata stored in memory_snapshots (hash only)
 * - Raw chunks remain (not deleted) for reference
 * - Entitlement-gated: enableDeepMemory (NOT tier strings)
 */

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";
import { getMemoryTierConfig, type MemoryTier } from "@/lib/memory/memoryTierConfig";
import { embedText } from "@/lib/memory/embed";
import { isDeepMemoryEnabled } from "@/lib/plans/featureRegistry";
import type { PlanEntitlement } from "@/lib/plans/types";
import { createHash } from "crypto";

// Types for consolidation
export type ConsolidationThreshold = {
  chunkCount: number;
  ageDays: number;
};

export type MemorySnapshotInput = {
  periodStart: Date;
  periodEnd: Date;
  summaryText: string; // Full text stored locally, hash only server-side
  sourceChunkHashes: string[];
  dominantThemes: string[];
  emotionalTone?: string;
};

export type MemorySnapshotRecord = {
  id: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  summaryHash: string;
  summaryTokenEstimate: number;
  sourceChunkCount: number;
  sourceChunkHashes: string[];
  dominantThemes: string[];
  emotionalTone: string | null;
  embedding: number[] | null;
  tier: "elite";
  createdAt: string;
};

// Elite-only thresholds
const ELITE_CONSOLIDATION_THRESHOLD: ConsolidationThreshold = {
  chunkCount: 50,    // Consolidate when user has 50+ chunks
  ageDays: 30,       // Only chunks older than 30 days
};

/**
 * Check if consolidation should run for a user.
 * Deep Memory feature (enableDeepMemory entitlement).
 * 
 * @param userId - The user ID
 * @param entitlements - User's entitlements (enableDeepMemory determines eligibility)
 */
export async function shouldRunConsolidation(
  userId: string,
  entitlements: PlanEntitlement
): Promise<boolean> {
  // Entitlement gate: Deep Memory enabled (NOT tier === "elite")
  if (!isDeepMemoryEnabled(entitlements)) return false;
  
  // Use elite tier config when Deep Memory is enabled
  const config = getMemoryTierConfig("elite");
  if (!config) return false;
  
  // Check if we have enough chunks to warrant consolidation
  const { count, error } = await fromSafe("memory_chunks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .lt("created_at", new Date(Date.now() - ELITE_CONSOLIDATION_THRESHOLD.ageDays * 24 * 60 * 60 * 1000).toISOString());
  
  if (error) {
    console.error("[consolidation] Error checking chunk count:", error);
    return false;
  }
  
  return (count ?? 0) >= ELITE_CONSOLIDATION_THRESHOLD.chunkCount;
}

/**
 * Get chunks eligible for consolidation (older than threshold).
 * Returns metadata only (hashes), not content.
 */
export async function getConsolidationCandidates(
  userId: string,
  ageDays: number = ELITE_CONSOLIDATION_THRESHOLD.ageDays
): Promise<Array<{ hash: string; createdAt: string; sourceType: string }>> {
  const cutoffDate = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await fromSafe("memory_chunks")
    .select("content_hash, created_at, source_type")
    .eq("user_id", userId)
    .lt("created_at", cutoffDate)
    .order("created_at", { ascending: true })
    .limit(100); // Process in batches
  
  if (error) {
    console.error("[consolidation] Error fetching candidates:", error);
    return [];
  }
  
  return (data ?? []).map((row: Record<string, unknown>) => ({
    hash: row.content_hash as string,
    createdAt: row.created_at as string,
    sourceType: row.source_type as string,
  }));
}

/**
 * Generate summary text from chunk hashes.
 * Note: This is a placeholder that would integrate with local content retrieval.
 * In practice, the actual summarization would happen client-side or via AI.
 * 
 * Returns summary metadata (full summary must be stored locally).
 */
export async function generateConsolidationSummary(
  _userId: string,
  chunkHashes: string[]
): Promise<{
  summaryText: string;
  dominantThemes: string[];
  emotionalTone: string;
  tokenEstimate: number;
} | null> {
  // Placeholder: In production, this would:
  // 1. Fetch actual content from IndexedDB using hashes
  // 2. Run AI summarization
  // 3. Store full summary locally
  // 4. Return metadata for server snapshot
  
  if (chunkHashes.length === 0) return null;
  
  // Mock summary for structure demonstration
  // Real implementation would integrate with local content and AI
  const themes = extractThemesFromHashes(chunkHashes);
  
  return {
    summaryText: `[Consolidated memory covering ${chunkHashes.length} entries. Themes: ${themes.join(", ")}]`,
    dominantThemes: themes,
    emotionalTone: "reflective",
    tokenEstimate: Math.ceil(chunkHashes.length * 10), // Rough estimate
  };
}

/**
 * Create a memory snapshot from consolidated chunks.
 * Stores metadata only (summary hash, not content).
 */
export async function createMemorySnapshot(
  userId: string,
  input: MemorySnapshotInput
): Promise<MemorySnapshotRecord | null> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin not configured.");
  }
  
  // Generate hash of summary (content stays local)
  const summaryHash = hashContent(input.summaryText);
  
  // Generate embedding for the summary (Elite feature)
  let embedding: number[] | null = null;
  let embeddingModel: string | null = null;
  
  try {
    const embeddings = await embedText([input.summaryText]);
    embedding = embeddings[0] ?? null;
    embeddingModel = "text-embedding-3-small";
  } catch (err) {
    // Continue without embedding if it fails
    console.warn("[consolidation] Embedding generation failed:", err);
  }
  
  const now = new Date().toISOString();
  
  type SnapshotInsert = Database["public"]["Tables"]["memory_snapshots"]["Insert"];
  
  const insert: SnapshotInsert = {
    user_id: userId,
    period_start: input.periodStart.toISOString(),
    period_end: input.periodEnd.toISOString(),
    summary_hash: summaryHash,
    summary_token_estimate: Math.ceil(input.summaryText.length / 4),
    source_chunk_count: input.sourceChunkHashes.length,
    source_chunk_hashes: input.sourceChunkHashes,
    dominant_themes: input.dominantThemes,
    emotional_tone: input.emotionalTone ?? null,
    embedding: embedding as unknown as Database["public"]["Tables"]["memory_snapshots"]["Row"]["embedding"],
    embedding_model: embeddingModel,
    embedded_at: embedding ? now : null,
    tier: "elite",
    created_at: now,
    updated_at: now,
  };
  
  const { data, error } = await safeInsert(
    "memory_snapshots",
    insert as Record<string, unknown>,
    undefined,
    supabaseAdmin
  )
    .select("id, user_id, period_start, period_end, summary_hash, summary_token_estimate, source_chunk_count, source_chunk_hashes, dominant_themes, emotional_tone, embedding, tier, created_at")
    .single();
  
  if (error) {
    console.error("[consolidation] Error creating snapshot:", error);
    return null;
  }
  
  const row = data as Record<string, unknown>;
  
  return {
    id: row.id as string,
    userId: row.user_id as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    summaryHash: row.summary_hash as string,
    summaryTokenEstimate: row.summary_token_estimate as number,
    sourceChunkCount: row.source_chunk_count as number,
    sourceChunkHashes: row.source_chunk_hashes as string[],
    dominantThemes: row.dominant_themes as string[],
    emotionalTone: row.emotional_tone as string | null,
    embedding: row.embedding as number[] | null,
    tier: row.tier as "elite",
    createdAt: row.created_at as string,
  };
}

/**
 * List memory snapshots for a user.
 * Deep Memory feature - requires enableDeepMemory entitlement.
 * 
 * @param userId - The user ID
 * @param _tier - Legacy tier parameter (kept for API compatibility, but unused)
 * @param entitlements - User's entitlements (enableDeepMemory determines eligibility)
 * @param limit - Maximum snapshots to return
 */
export async function listMemorySnapshots(
  userId: string,
  _tier: MemoryTier,
  entitlements: PlanEntitlement,
  limit: number = 10
): Promise<MemorySnapshotRecord[]> {
  // Entitlement gate: Deep Memory enabled (NOT tier === "elite")
  if (!isDeepMemoryEnabled(entitlements)) return [];
  
  const { data, error } = await fromSafe("memory_snapshots")
    .select("id, user_id, period_start, period_end, summary_hash, summary_token_estimate, source_chunk_count, source_chunk_hashes, dominant_themes, emotional_tone, embedding, tier, created_at")
    .eq("user_id", userId)
    .eq("tier", "elite")
    .order("period_end", { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error("[consolidation] Error listing snapshots:", error);
    return [];
  }
  
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    userId: row.user_id as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    summaryHash: row.summary_hash as string,
    summaryTokenEstimate: row.summary_token_estimate as number,
    sourceChunkCount: row.source_chunk_count as number,
    sourceChunkHashes: row.source_chunk_hashes as string[],
    dominantThemes: row.dominant_themes as string[],
    emotionalTone: row.emotional_tone as string | null,
    embedding: row.embedding as number[] | null,
    tier: row.tier as "elite",
    createdAt: row.created_at as string,
  }));
}

// Helper functions
function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function extractThemesFromHashes(hashes: string[]): string[] {
  // Placeholder: In production, this would analyze actual content
  // For now, return generic themes based on hash patterns (deterministic)
  const themes = new Set<string>();
  
  for (const hash of hashes) {
    // Deterministic theme extraction from hash prefix
    const prefix = hash.slice(0, 2);
    const num = parseInt(prefix, 16);
    
    if (num % 3 === 0) themes.add("growth");
    if (num % 5 === 0) themes.add("relationships");
    if (num % 7 === 0) themes.add("work");
    if (num % 11 === 0) themes.add("health");
    if (num % 13 === 0) themes.add("identity");
  }
  
  return Array.from(themes).slice(0, 3);
}
