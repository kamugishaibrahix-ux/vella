/**
 * Phase 6C: Top-K memory retrieval. Cosine similarity + recency blend.
 * Fallback: recency-only when embeddings unavailable (AI disabled or free plan).
 */

import { embedText, AIDisabledError } from "@/lib/memory/embed";
import { getRecentEmbeddedChunks, getRecentChunks } from "@/lib/memory/db";
import type { MemoryChunkRecord } from "@/lib/memory/db";
import { getUserPlanTier } from "@/lib/tiers/server";
import { isAIDisabled } from "@/lib/security/killSwitch";

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
};

const DEFAULT_K = 6;
const DEFAULT_MAX_CHARS = 1500;
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
 * Retrieve top-K memory blocks. If embeddings allowed and available: similarity + recency.
 * Else: recency-only (deterministic). Caps total excerpt length to maxCharsTotal.
 */
export async function retrieveTopK(opts: RetrieveOptions): Promise<MemoryBlock[]> {
  const k = Math.min(opts.k ?? DEFAULT_K, 20);
  const maxCharsTotal = opts.maxCharsTotal ?? DEFAULT_MAX_CHARS;
  const sourceTypes = opts.sourceTypes;
  const planTier = await getUserPlanTier(opts.userId).catch(() => "free" as const);
  const paid = planTier === "pro" || planTier === "elite";
  const useEmbeddings = opts.useEmbeddings !== false && paid && !isAIDisabled();

  let candidates: MemoryChunkRecord[];
  let queryEmbedding: number[] | null = null;

  if (useEmbeddings) {
    try {
      const [emb, embeddedChunks] = await Promise.all([
        embedText([opts.queryText]).then((arr) => arr[0] ?? null),
        getRecentEmbeddedChunks({ userId: opts.userId, limit: 200, sourceTypes }),
      ]);
      queryEmbedding = emb;
      candidates = embeddedChunks.filter((c) => c.embedding != null && c.embedding.length > 0);
      if (queryEmbedding && candidates.length === 0) return [];
      if (!queryEmbedding || candidates.length === 0) {
        candidates = await getRecentChunks({ userId: opts.userId, limit: 30, sourceTypes });
        return buildRecencyOnly(candidates, k, maxCharsTotal);
      }
    } catch (err) {
      if (err instanceof AIDisabledError) {
        candidates = await getRecentChunks({ userId: opts.userId, limit: 30, sourceTypes });
        return buildRecencyOnly(candidates, k, maxCharsTotal);
      }
      candidates = await getRecentChunks({ userId: opts.userId, limit: 30, sourceTypes });
      return buildRecencyOnly(candidates, k, maxCharsTotal);
    }
  } else {
    candidates = await getRecentChunks({ userId: opts.userId, limit: 30, sourceTypes });
    return buildRecencyOnly(candidates, k, maxCharsTotal);
  }

  if (!queryEmbedding) return buildRecencyOnly(candidates, k, maxCharsTotal);

  const scored = candidates.map((c) => {
    const sim = cosineSimilarity(queryEmbedding!, c.embedding!);
    const rec = recencyBoost(c.created_at);
    const score = sim * SIM_WEIGHT + rec * RECENCY_WEIGHT;
    return { chunk: c, score };
  });
  scored.sort((a, b) => b.score - a.score);
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
