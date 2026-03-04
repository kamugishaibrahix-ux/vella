/**
 * Phase 6C + Phase 1: Memory chunks DB layer. Server-only.
 * Uses fromSafe (RLS applies for user context); admin for service-key jobs.
 * Phase 1: memory_chunks unblocked - stores embeddings (vectors only), content remains local.
 * NEVER stores raw content (content column always empty string per local-first contract).
 */

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeUpsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";

type ChunkRow = Database["public"]["Tables"]["memory_chunks"]["Row"];
type ChunkInsert = Database["public"]["Tables"]["memory_chunks"]["Insert"];

export type MemoryChunkRecord = {
  id: string;
  user_id: string;
  source_type: "journal" | "conversation" | "snapshot";
  source_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  token_estimate: number;
  embedding: number[] | null;
  embedding_model: string | null;
  embedded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChunkInput = {
  chunk_index: number;
  content: string;
  content_hash: string;
  token_estimate: number;
};

const MAX_CONTENT_LENGTH = 1200;

function trimContent(content: string): string {
  const t = content.trim().replace(/\s+/g, " ");
  return t.length > MAX_CONTENT_LENGTH ? t.slice(0, MAX_CONTENT_LENGTH) : t;
}

/**
 * Idempotent: inserts chunks; duplicates (same user_id, source_type, source_id, chunk_index, content_hash) are ignored.
 */
export async function upsertChunksForSource(opts: {
  userId: string;
  sourceType: "journal" | "conversation" | "snapshot";
  sourceId: string;
  chunks: ChunkInput[];
}): Promise<{ inserted: number }> {
  if (opts.chunks.length === 0) return { inserted: 0 };
  const now = new Date().toISOString();
  const rows: ChunkInsert[] = opts.chunks.map((c) => ({
    user_id: opts.userId,
    source_type: opts.sourceType,
    source_id: opts.sourceId,
    chunk_index: c.chunk_index,
    content_hash: c.content_hash,
    token_estimate: c.token_estimate,
    created_at: now,
    updated_at: now,
  }));
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const { data, error } = await safeUpsert(
    "memory_chunks",
    rows as Record<string, unknown>[],
    { onConflict: "memory_chunks_unique_key", ignoreDuplicates: true },
    supabaseAdmin,
  )
    .select("id");
  if (error) throw error;
  return { inserted: (data?.length ?? 0) as number };
}

/**
 * List chunks with embedded_at IS NULL. For service-key embed job.
 */
export async function listUnembeddedChunks(opts: {
  userId?: string;
  limit?: number;
}): Promise<MemoryChunkRecord[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  let q = fromSafe("memory_chunks")
    .select("id, user_id, source_type, source_id, chunk_index, content_hash, token_estimate, embedding, embedding_model, embedded_at, created_at, updated_at")
    .is("embedded_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (opts.userId) {
    q = q.eq("user_id", opts.userId) as typeof q;
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as ChunkRow[];
  return rows.map(rowToRecord);
}

/**
 * Set embedding for a chunk after successful embed.
 */
export async function markChunkEmbedded(opts: {
  chunkId: string;
  embedding: number[];
  model: string;
}): Promise<void> {
  const now = new Date().toISOString();
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const { error } = await safeUpdate(
    "memory_chunks",
    {
      embedding: opts.embedding as unknown as Database["public"]["Tables"]["memory_chunks"]["Row"]["embedding"],
      embedding_model: opts.model,
      embedded_at: now,
      updated_at: now,
    } as Record<string, unknown>,
    undefined,
    supabaseAdmin,
  )
    .eq("id", opts.chunkId);
  if (error) throw error;
}

/**
 * Get recent chunks (for recency-only fallback when embeddings disabled).
 */
export async function getRecentChunks(opts: {
  userId: string;
  limit?: number;
  sourceTypes?: ("journal" | "conversation" | "snapshot")[];
}): Promise<MemoryChunkRecord[]> {
  const limit = Math.min(opts.limit ?? 30, 200);
  let q = fromSafe("memory_chunks")
    .select("id, user_id, source_type, source_id, chunk_index, content_hash, token_estimate, embedding, embedding_model, embedded_at, created_at, updated_at")
    .eq("user_id", opts.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.sourceTypes?.length) {
    q = q.in("source_type", opts.sourceTypes) as typeof q;
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as ChunkRow[];
  return rows.map(rowToRecord);
}

/**
 * Get recent embedded chunks for similarity search (fetch candidate set).
 */
export async function getRecentEmbeddedChunks(opts: {
  userId: string;
  limit?: number;
  sourceTypes?: ("journal" | "conversation" | "snapshot")[];
}): Promise<MemoryChunkRecord[]> {
  const limit = Math.min(opts.limit ?? 200, 300);
  let q = fromSafe("memory_chunks")
    .select("id, user_id, source_type, source_id, chunk_index, content_hash, token_estimate, embedding, embedding_model, embedded_at, created_at, updated_at")
    .eq("user_id", opts.userId)
    .not("embedded_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.sourceTypes?.length) {
    q = q.in("source_type", opts.sourceTypes) as typeof q;
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as ChunkRow[];
  return rows.map(rowToRecord);
}

function rowToRecord(r: ChunkRow): MemoryChunkRecord {
  const emb = r.embedding;
  const arr = Array.isArray(emb) ? (emb as number[]) : null;
  return {
    id: r.id,
    user_id: r.user_id,
    source_type: r.source_type as "journal" | "conversation" | "snapshot",
    source_id: r.source_id,
    chunk_index: r.chunk_index,
    content: "", // M4.5: content column dropped; server holds metadata only
    content_hash: r.content_hash,
    token_estimate: r.token_estimate,
    embedding: arr,
    embedding_model: r.embedding_model,
    embedded_at: r.embedded_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
