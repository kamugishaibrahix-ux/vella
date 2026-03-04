/**
 * Phase 3: Episodic Memory Clustering
 * Groups memory chunks by temporal proximity and thematic similarity.
 * Deep Memory feature (enableDeepMemory entitlement). Cluster metadata only (no raw content).
 * 
 * Architecture:
 * - Clusters are deterministic groupings of related chunks
 * - Each cluster has: time range, dominant theme, summary hash
 * - Member chunks referenced by hash only (local content)
 * - Entitlement-gated: enableDeepMemory (NOT tier strings)
 */

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";
import { getMemoryTierConfig, type MemoryTier } from "@/lib/memory/memoryTierConfig";
import { embedText } from "@/lib/memory/embed";
import { isDeepMemoryEnabled } from "@/lib/plans/featureRegistry";
import type { PlanEntitlement } from "@/lib/plans/types";
import { createHash } from "crypto";

// Clustering configuration
const CLUSTER_CONFIG = {
  temporalWindowDays: 7,      // Chunks within 7 days can cluster together
  minClusterSize: 3,          // Minimum chunks to form a cluster
  maxClustersPerUser: 20,     // Prevent unbounded growth
  themeSimilarityThreshold: 0.6, // Minimum theme overlap (placeholder)
};

// Types
export type MemoryClusterInput = {
  clusterKey: string;         // Deterministic identifier
  timeRangeStart: Date;
  timeRangeEnd: Date;
  dominantTheme: string;
  secondaryThemes: string[];
  summaryText: string;        // Full text local, hash only server-side
  memberChunkHashes: string[];
  cohesionScore?: number;     // 0-1 thematic cohesion
};

export type MemoryClusterRecord = {
  id: string;
  userId: string;
  clusterKey: string;
  timeRangeStart: string;
  timeRangeEnd: string;
  dominantTheme: string;
  secondaryThemes: string[];
  summaryHash: string;
  summaryTokenEstimate: number;
  memberChunkHashes: string[];
  memberCount: number;
  cohesionScore: number | null;
  embedding: number[] | null;
  isActive: boolean;
  tier: "elite";
  createdAt: string;
  updatedAt: string;
};

/**
 * Check if clustering should run for a user.
 * Deep Memory feature (enableDeepMemory entitlement).
 * 
 * @param userId - The user ID
 * @param entitlements - User's entitlements (enableDeepMemory determines eligibility)
 */
export async function shouldRunClustering(
  userId: string,
  entitlements: PlanEntitlement
): Promise<boolean> {
  // Entitlement gate: Deep Memory enabled (NOT tier === "elite")
  if (!isDeepMemoryEnabled(entitlements)) return false;
  
  // Check active cluster count
  const { count, error } = await fromSafe("memory_clusters")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);
  
  if (error) {
    console.error("[clustering] Error checking cluster count:", error);
    return false;
  }
  
  // Run clustering if under the limit
  return (count ?? 0) < CLUSTER_CONFIG.maxClustersPerUser;
}

/**
 * Generate clusters from memory chunks.
 * Returns cluster metadata (deterministic clustering algorithm).
 * Deep Memory feature - requires enableDeepMemory entitlement.
 * 
 * @param userId - The user ID
 * @param entitlements - User's entitlements (enableDeepMemory determines eligibility)
 */
export async function generateClusters(
  userId: string,
  entitlements: PlanEntitlement
): Promise<MemoryClusterInput[]> {
  // Entitlement gate: Deep Memory enabled (NOT tier === "elite")
  if (!isDeepMemoryEnabled(entitlements)) return [];
  
  // Fetch recent chunks for clustering (metadata only)
  const { data, error } = await fromSafe("memory_chunks")
    .select("content_hash, created_at, source_type")
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()) // Last 90 days
    .order("created_at", { ascending: true });
  
  if (error || !data) {
    console.error("[clustering] Error fetching chunks:", error);
    return [];
  }
  
  const chunks = (data as Array<{ content_hash: string; created_at: string; source_type: string }>);
  
  if (chunks.length < CLUSTER_CONFIG.minClusterSize) {
    return []; // Not enough chunks to cluster
  }
  
  // Simple temporal clustering algorithm
  const clusters = performTemporalClustering(chunks);
  
  // Generate cluster inputs
  return clusters.map((cluster) => ({
    clusterKey: generateClusterKey(userId, cluster.hashes),
    timeRangeStart: new Date(cluster.startTime),
    timeRangeEnd: new Date(cluster.endTime),
    dominantTheme: cluster.dominantTheme,
    secondaryThemes: cluster.secondaryThemes,
    summaryText: generateClusterSummary(cluster),
    memberChunkHashes: cluster.hashes,
    cohesionScore: cluster.cohesionScore,
  }));
}

/**
 * Create or update a memory cluster.
 * Stores metadata only (summary hash, not content).
 */
export async function upsertMemoryCluster(
  userId: string,
  input: MemoryClusterInput
): Promise<MemoryClusterRecord | null> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin not configured.");
  }
  
  // Check if cluster already exists
  const { data: existing, error: fetchError } = await fromSafe("memory_clusters")
    .select("id, member_chunk_hashes")
    .eq("user_id", userId)
    .eq("cluster_key", input.clusterKey)
    .maybeSingle();
  
  if (fetchError) {
    console.error("[clustering] Error checking existing cluster:", fetchError);
    return null;
  }
  
  // Generate hash of summary (content stays local)
  const summaryHash = hashContent(input.summaryText);
  
  // Generate embedding for cluster (Elite feature)
  let embedding: number[] | null = null;
  let embeddingModel: string | null = null;
  
  try {
    const embeddings = await embedText([input.summaryText]);
    embedding = embeddings[0] ?? null;
    embeddingModel = "text-embedding-3-small";
  } catch (err) {
    console.warn("[clustering] Embedding generation failed:", err);
  }
  
  const now = new Date().toISOString();
  
  if (existing) {
    // Update existing cluster with new members
    const existingHashes = (existing as { member_chunk_hashes: string[] }).member_chunk_hashes;
    const mergedHashes = Array.from(new Set([...existingHashes, ...input.memberChunkHashes]));
    
    type ClusterUpdate = Database["public"]["Tables"]["memory_clusters"]["Update"];
    
    const update: ClusterUpdate = {
      time_range_start: input.timeRangeStart.toISOString(),
      time_range_end: input.timeRangeEnd.toISOString(),
      summary_hash: summaryHash,
      summary_token_estimate: Math.ceil(input.summaryText.length / 4),
      member_chunk_hashes: mergedHashes,
      member_count: mergedHashes.length,
      cohesion_score: input.cohesionScore ?? null,
      embedding: embedding as unknown as Database["public"]["Tables"]["memory_clusters"]["Row"]["embedding"],
      embedding_model: embeddingModel,
      embedded_at: embedding ? now : null,
      updated_at: now,
    };
    
    const { data, error } = await safeUpdate(
      "memory_clusters",
      update as Record<string, unknown>,
      undefined,
      supabaseAdmin
    )
      .eq("id", (existing as { id: string }).id)
      .select()
      .single();
    
    if (error) {
      console.error("[clustering] Error updating cluster:", error);
      return null;
    }
    
    return rowToClusterRecord(data as Record<string, unknown>);
  } else {
    // Create new cluster
    type ClusterInsert = Database["public"]["Tables"]["memory_clusters"]["Insert"];
    
    const insert: ClusterInsert = {
      user_id: userId,
      cluster_key: input.clusterKey,
      time_range_start: input.timeRangeStart.toISOString(),
      time_range_end: input.timeRangeEnd.toISOString(),
      dominant_theme: input.dominantTheme,
      secondary_themes: input.secondaryThemes,
      summary_hash: summaryHash,
      summary_token_estimate: Math.ceil(input.summaryText.length / 4),
      member_chunk_hashes: input.memberChunkHashes,
      member_count: input.memberChunkHashes.length,
      cohesion_score: input.cohesionScore ?? null,
      embedding: embedding as unknown as Database["public"]["Tables"]["memory_clusters"]["Row"]["embedding"],
      embedding_model: embeddingModel,
      embedded_at: embedding ? now : null,
      tier: "elite",
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    
    const { data, error } = await safeInsert(
      "memory_clusters",
      insert as Record<string, unknown>,
      undefined,
      supabaseAdmin
    )
      .select()
      .single();
    
    if (error) {
      console.error("[clustering] Error creating cluster:", error);
      return null;
    }
    
    return rowToClusterRecord(data as Record<string, unknown>);
  }
}

/**
 * List active memory clusters for a user.
 * Deep Memory feature - requires enableDeepMemory entitlement.
 * 
 * @param userId - The user ID
 * @param _tier - Legacy tier parameter (kept for API compatibility, but unused)
 * @param entitlements - User's entitlements (enableDeepMemory determines eligibility)
 * @param limit - Maximum clusters to return
 */
export async function listMemoryClusters(
  userId: string,
  _tier: MemoryTier,
  entitlements: PlanEntitlement,
  limit: number = 10
): Promise<MemoryClusterRecord[]> {
  // Entitlement gate: Deep Memory enabled (NOT tier === "elite")
  if (!isDeepMemoryEnabled(entitlements)) return [];
  
  const { data, error } = await fromSafe("memory_clusters")
    .select()
    .eq("user_id", userId)
    .eq("tier", "elite")
    .eq("is_active", true)
    .order("time_range_end", { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error("[clustering] Error listing clusters:", error);
    return [];
  }
  
  return (data ?? []).map((row: Record<string, unknown>) => rowToClusterRecord(row));
}

/**
 * Deactivate old clusters (soft delete).
 * Used when recalculating clusters.
 * Deep Memory feature - requires enableDeepMemory entitlement.
 * 
 * @param userId - The user ID
 * @param entitlements - User's entitlements (enableDeepMemory determines eligibility)
 * @param olderThan - Deactivate clusters older than this date
 */
export async function deactivateOldClusters(
  userId: string,
  entitlements: PlanEntitlement,
  olderThan: Date
): Promise<number> {
  // Entitlement gate: Deep Memory enabled (NOT tier === "elite")
  if (!isDeepMemoryEnabled(entitlements)) return 0;
  
  const { data, error } = await fromSafe("memory_clusters")
    .update({ is_active: false, updated_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .lt("created_at", olderThan.toISOString())
    .select("id");
  
  if (error) {
    console.error("[clustering] Error deactivating clusters:", error);
    return 0;
  }
  
  return (data ?? []).length;
}

// Helper functions
function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function generateClusterKey(userId: string, hashes: string[]): string {
  // Deterministic key based on user + sorted hashes
  const sortedHashes = [...hashes].sort();
  const combined = `${userId}:${sortedHashes.join(":")}`;
  return hashContent(combined).slice(0, 16);
}

type TemporalCluster = {
  hashes: string[];
  startTime: string;
  endTime: string;
  dominantTheme: string;
  secondaryThemes: string[];
  cohesionScore: number;
};

function performTemporalClustering(
  chunks: Array<{ content_hash: string; created_at: string; source_type: string }>
): TemporalCluster[] {
  const clusters: TemporalCluster[] = [];
  const windowMs = CLUSTER_CONFIG.temporalWindowDays * 24 * 60 * 60 * 1000;
  
  // Sort by time
  const sorted = [...chunks].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  let currentCluster: typeof chunks = [];
  
  for (const chunk of sorted) {
    if (currentCluster.length === 0) {
      currentCluster.push(chunk);
    } else {
      const lastTime = new Date(currentCluster[currentCluster.length - 1].created_at).getTime();
      const chunkTime = new Date(chunk.created_at).getTime();
      
      if (chunkTime - lastTime <= windowMs) {
        currentCluster.push(chunk);
      } else {
        // Finalize current cluster
        if (currentCluster.length >= CLUSTER_CONFIG.minClusterSize) {
          clusters.push(finalizeCluster(currentCluster));
        }
        currentCluster = [chunk];
      }
    }
  }
  
  // Finalize last cluster
  if (currentCluster.length >= CLUSTER_CONFIG.minClusterSize) {
    clusters.push(finalizeCluster(currentCluster));
  }
  
  return clusters;
}

function finalizeCluster(chunks: Array<{ content_hash: string; source_type: string; created_at: string }>): TemporalCluster {
  const hashes = chunks.map((c) => c.content_hash);
  const themes = extractThemesFromChunks(chunks);
  
  return {
    hashes,
    startTime: chunks[0].created_at,
    endTime: chunks[chunks.length - 1].created_at,
    dominantTheme: themes[0] ?? "mixed",
    secondaryThemes: themes.slice(1),
    cohesionScore: calculateCohesion(chunks),
  };
}

function extractThemesFromChunks(chunks: Array<{ source_type: string }>): string[] {
  // Placeholder: In production, analyze actual content
  // For now, use source_type to infer themes
  const themeCounts = new Map<string, number>();
  
  for (const chunk of chunks) {
    const theme = chunk.source_type === "journal" ? "reflection" :
                  chunk.source_type === "conversation" ? "interaction" :
                  "behavior";
    themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
  }
  
  return Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([theme]) => theme)
    .slice(0, 3);
}

function calculateCohesion(chunks: unknown[]): number {
  // Placeholder: In production, calculate actual thematic cohesion
  // Return deterministic score based on chunk count
  const base = Math.min(chunks.length / 10, 1);
  return Math.round(base * 100) / 100;
}

function generateClusterSummary(cluster: TemporalCluster): string {
  const days = Math.ceil(
    (new Date(cluster.endTime).getTime() - new Date(cluster.startTime).getTime()) / 
    (24 * 60 * 60 * 1000)
  );
  
  return `[${days}-day cluster: ${cluster.hashes.length} entries. Themes: ${cluster.dominantTheme}${cluster.secondaryThemes.length > 0 ? ", " + cluster.secondaryThemes.join(", ") : ""}]`;
}

function rowToClusterRecord(row: Record<string, unknown>): MemoryClusterRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    clusterKey: row.cluster_key as string,
    timeRangeStart: row.time_range_start as string,
    timeRangeEnd: row.time_range_end as string,
    dominantTheme: row.dominant_theme as string,
    secondaryThemes: row.secondary_themes as string[],
    summaryHash: row.summary_hash as string,
    summaryTokenEstimate: row.summary_token_estimate as number,
    memberChunkHashes: row.member_chunk_hashes as string[],
    memberCount: row.member_count as number,
    cohesionScore: row.cohesion_score as number | null,
    embedding: row.embedding as number[] | null,
    isActive: row.is_active as boolean,
    tier: row.tier as "elite",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
