/**
 * Phase 6C + Phase 1 + Phase 2 + Phase 3: Top-K memory retrieval with tier scaling.
 * Cosine similarity + recency blend with strict tier-based limits.
 * Fallback: recency-only when embeddings unavailable (AI disabled or free tier).
 * Deterministic: consistent scoring, hard caps, stable tie-breaking by created_at desc.
 * Phase 3: Narrative memory layer (Elite only) - long-term context before recent memory.
 */

import { embedText, AIDisabledError } from "@/lib/memory/embed";
import { getRecentEmbeddedChunks, getRecentChunks } from "@/lib/memory/db";
import type { MemoryChunkRecord } from "@/lib/memory/db";
import { getUserPlanTier } from "@/lib/tiers/server";
import { isAIDisabled } from "@/lib/security/killSwitch";
import {
  type MemoryTier,
  type MemoryTierConfig,
  getMemoryTierConfig,
  filterByRecencyWindow,
} from "@/lib/memory/memoryTierConfig";
import {
  buildNarrativeMemoryContext,
  formatCompleteMemoryContext,
  calculateTotalMemorySize,
  type NarrativeMemoryContext,
} from "@/lib/memory/narrative";

export type MemoryBlock = {
  sourceType: "journal" | "conversation" | "snapshot";
  sourceId: string;
  excerpt: string;
  score: number;
  createdAtISO: string;
};

export type RetrieveOptions = {
  userId: string;
  queryText: string;
  k?: number;
  sourceTypes?: ("journal" | "conversation" | "snapshot")[];
  maxCharsTotal?: number;
  useEmbeddings?: boolean;
  /** Phase 2: Explicit tier override (defaults to looking up from user plan) */
  tier?: MemoryTier;
};

const RECENCY_WEIGHT = 0.15;
const SIM_WEIGHT = 0.85;

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Recency boost from age: newer = higher. Bucket by days.
 */
function recencyBoost(createdAtISO: string): number {
  const ageMs = Date.now() - new Date(createdAtISO).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays <= 0) return 1;
  if (ageDays <= 1) return 0.9;
  if (ageDays <= 7) return 0.7;
  if (ageDays <= 30) return 0.4;
  return 0.2;
}

function truncateExcerpt(content: string, maxLen: number): string {
  const t = content.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + "…";
}

/**
 * Phase 2: Retrieve top-K memory blocks with tier-based scaling.
 * 
 * Tier enforcement:
 * - Free: Recency-only, 30-day window, 3 chunks, 800 chars
 * - Pro: Similarity enabled, 90-day window, 6 chunks, 1500 chars  
 * - Elite: Similarity enabled, full history, 18 chunks, 4000 chars
 * 
 * Time filtering is applied BEFORE similarity scoring (strict enforcement).
 */
export async function retrieveTopK(opts: RetrieveOptions): Promise<MemoryBlock[]> {
  // Phase 2: Resolve tier and get configuration
  let planTier: MemoryTier;
  if (opts.tier) {
    planTier = opts.tier;
  } else {
    try {
      planTier = await getUserPlanTier(opts.userId);
    } catch {
      planTier = "free";
      console.error("[retrieveTopK] getUserPlanTier failed – falling back to free tier config (restrictive)", { userId: opts.userId });
    }
  }
  const tierConfig = getMemoryTierConfig(planTier);
  
  // Apply tier-based hard caps (opts can only reduce, never exceed tier limits)
  const k = Math.min(opts.k ?? tierConfig.maxChunks, tierConfig.maxChunks);
  const maxCharsTotal = Math.min(
    opts.maxCharsTotal ?? tierConfig.maxCharsTotal,
    tierConfig.maxCharsTotal
  );
  const sourceTypes = opts.sourceTypes;
  
  // Phase 2: Determine if embeddings enabled (tier-based + kill switch)
  const useEmbeddings = opts.useEmbeddings !== false && 
                        tierConfig.useSimilarity && 
                        !isAIDisabled();

  let candidates: MemoryChunkRecord[];
  let queryEmbedding: number[] | null = null;

  if (useEmbeddings) {
    try {
      // Phase 2: Use tier-based candidate pool limit
      const [emb, embeddedChunks] = await Promise.all([
        embedText([opts.queryText]).then((arr) => arr[0] ?? null),
        getRecentEmbeddedChunks({ 
          userId: opts.userId, 
          limit: tierConfig.candidatePoolLimit, 
          sourceTypes 
        }),
      ]);
      queryEmbedding = emb;
      
      // Phase 2: Apply time filtering BEFORE similarity scoring (strict enforcement)
      candidates = filterByRecencyWindow(
        embeddedChunks.filter((c) => c.embedding != null && c.embedding.length > 0),
        tierConfig.recencyDaysCap
      );
      
      if (queryEmbedding && candidates.length === 0) return [];
      if (!queryEmbedding || candidates.length === 0) {
        candidates = await getRecentChunks({ 
          userId: opts.userId, 
          limit: tierConfig.candidatePoolLimit, 
          sourceTypes 
        });
        // Apply time filter to recency fallback too
        candidates = filterByRecencyWindow(candidates, tierConfig.recencyDaysCap);
        return buildRecencyOnly(candidates, k, maxCharsTotal);
      }
    } catch (err) {
      if (err instanceof AIDisabledError) {
        candidates = await getRecentChunks({ 
          userId: opts.userId, 
          limit: tierConfig.candidatePoolLimit, 
          sourceTypes 
        });
        candidates = filterByRecencyWindow(candidates, tierConfig.recencyDaysCap);
        return buildRecencyOnly(candidates, k, maxCharsTotal);
      }
      candidates = await getRecentChunks({ 
        userId: opts.userId, 
        limit: tierConfig.candidatePoolLimit, 
        sourceTypes 
      });
      candidates = filterByRecencyWindow(candidates, tierConfig.recencyDaysCap);
      return buildRecencyOnly(candidates, k, maxCharsTotal);
    }
  } else {
    // Phase 2: Recency-only path (free tier or embeddings disabled)
    candidates = await getRecentChunks({ 
      userId: opts.userId, 
      limit: tierConfig.candidatePoolLimit, 
      sourceTypes 
    });
    // Apply time filter
    candidates = filterByRecencyWindow(candidates, tierConfig.recencyDaysCap);
    return buildRecencyOnly(candidates, k, maxCharsTotal);
  }

  if (!queryEmbedding) {
    candidates = filterByRecencyWindow(candidates, tierConfig.recencyDaysCap);
    return buildRecencyOnly(candidates, k, maxCharsTotal);
  }

  // Phase 2: Similarity scoring with time-filtered candidates
  const scored = candidates.map((c) => {
    const sim = cosineSimilarity(queryEmbedding!, c.embedding!);
    const rec = recencyBoost(c.created_at);
    const score = sim * SIM_WEIGHT + rec * RECENCY_WEIGHT;
    return { chunk: c, score, createdAt: c.created_at };
  });
  
  // Deterministic sort: primary by score desc, tie-break by created_at desc (newer first)
  scored.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 1e-10) return scoreDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });
  
  const top = scored.slice(0, k);
  return buildBlocks(top.map((t) => t.chunk), top.map((t) => t.score), maxCharsTotal);
}

function buildRecencyOnly(
  candidates: MemoryChunkRecord[],
  k: number,
  maxCharsTotal: number
): MemoryBlock[] {
  const top = candidates.slice(0, k);
  const scores = top.map(() => 0.5);
  return buildBlocks(top, scores, maxCharsTotal);
}

function buildBlocks(
  chunks: MemoryChunkRecord[],
  scores: number[],
  maxCharsTotal: number
): MemoryBlock[] {
  const blocks: MemoryBlock[] = [];
  let used = 0;
  const perExcerpt = Math.max(200, Math.floor(maxCharsTotal / Math.max(1, chunks.length)));
  for (let i = 0; i < chunks.length; i++) {
    if (used >= maxCharsTotal) break;
    const c = chunks[i];
    const excerpt = truncateExcerpt(c.content, perExcerpt);
    used += excerpt.length;
    blocks.push({
      sourceType: c.source_type,
      sourceId: c.source_id,
      excerpt,
      score: scores[i] ?? 0,
      createdAtISO: c.created_at,
    });
  }
  return blocks;
}

/**
 * Format memory blocks for injection into LLM context (bullet list).
 */
export function formatMemoryContext(blocks: MemoryBlock[], includeExcerpts: boolean): string {
  if (blocks.length === 0) return "";
  const lines = blocks.map((b) => {
    const label = `[${b.sourceType}:${b.sourceId.slice(0, 8)}]`;
    if (includeExcerpts && b.excerpt) {
      return `• ${label} ${b.excerpt}`;
    }
    return `• ${label}`;
  });
  return `Relevant memory:\n${lines.join("\n")}`;
}

/**
 * Phase 3: Build complete memory context including narrative layer.
 * 
 * Structure:
 * 1. Narrative layer (enableDeepMemory entitlement) - long-term trajectory and themes
 * 2. Recent memory - specific recent chunks
 * 
 * This function handles entitlement gating internally - NOT tier strings.
 */
export async function buildCompleteMemoryContext(opts: {
  userId: string;
  tier: MemoryTier;
  recentBlocks: MemoryBlock[];
  includeExcerpts: boolean;
  /**
   * Deep Memory entitlement - REQUIRED for narrative layer.
   * This is the PURE abstraction gate - no tier strings allowed.
   */
  entitlements: import("@/lib/plans/types").PlanEntitlement;
}): Promise<{
  context: string;
  charCount: number;
  tokenEstimate: number;
  hasNarrative: boolean;
}> {
  // Phase 3: Build narrative layer (Deep Memory entitlement)
  const narrativeContext = await buildNarrativeMemoryContext(opts.userId, opts.entitlements);
  
  // Format recent memory
  const recentMemoryContext = formatMemoryContext(opts.recentBlocks, opts.includeExcerpts);
  
  // Combine: Narrative comes FIRST, then recent specific memory
  const completeContext = formatCompleteMemoryContext(narrativeContext, recentMemoryContext);
  
  // Calculate total size for token estimation
  const totalChars = calculateTotalMemorySize(narrativeContext, recentMemoryContext.length);
  
  return {
    context: completeContext,
    charCount: totalChars,
    tokenEstimate: Math.ceil(totalChars / 4),
    hasNarrative: narrativeContext.hasNarrative,
  };
}

// Re-export types for convenience
export type { NarrativeMemoryContext };
