/**
 * Phase 6C: Memory chunking. Server-only.
 * Normalize, hash, and split journal / conversation / snapshot into chunks.
 */

import { createHash } from "crypto";

const MAX_CHUNK_CHARS = 1200;

export type ChunkInput = {
  chunk_index: number;
  content: string;
  content_hash: string;
  token_estimate: number;
};

/**
 * SHA256 hex of normalized content (trim + collapse whitespace). Server-only.
 */
export function hashContent(normalized: string): string {
  const s = normalized.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function tokenEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks by paragraph; each chunk <= MAX_CHUNK_CHARS.
 */
function splitIntoChunks(text: string): string[] {
  const n = normalize(text);
  if (!n) return [];
  const paragraphs = n.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    const next = current ? `${current}\n\n${p}` : p;
    if (next.length <= MAX_CHUNK_CHARS) {
      current = next;
    } else {
      if (current) chunks.push(current);
      if (p.length <= MAX_CHUNK_CHARS) {
        current = p;
      } else {
        for (let i = 0; i < p.length; i += MAX_CHUNK_CHARS) {
          chunks.push(p.slice(i, i + MAX_CHUNK_CHARS));
        }
        current = "";
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Journal: title + "\n" + content, then split by paragraph.
 */
export function chunkJournal(opts: { title?: string | null; content: string }): ChunkInput[] {
  const title = opts.title?.trim() ?? "";
  const content = opts.content?.trim() ?? "";
  const combined = title ? `${title}\n${content}` : content;
  if (!combined) return [];
  const texts = splitIntoChunks(combined);
  return texts.map((text, i) => ({
    chunk_index: i,
    content: text,
    content_hash: hashContent(text),
    token_estimate: tokenEstimate(text),
  }));
}

/**
 * Conversation: one chunk per message (role + content) to avoid duplicating user content heavily.
 * Format: "assistant: ..." or "user: ..." per chunk.
 */
export function chunkConversation(messages: { role: string; content: string }[]): ChunkInput[] {
  const chunks: ChunkInput[] = [];
  messages.forEach((msg, i) => {
    const content = normalize(msg.content);
    if (!content) return;
    const line = `${msg.role}: ${content}`;
    const truncated = line.length > MAX_CHUNK_CHARS ? line.slice(0, MAX_CHUNK_CHARS) : line;
    chunks.push({
      chunk_index: i,
      content: truncated,
      content_hash: hashContent(truncated),
      token_estimate: tokenEstimate(truncated),
    });
  });
  return chunks;
}

/**
 * Snapshot: deterministic compact summary from state_json (NO LLM).
 * If state has a top-level "summary" string use it; else build from traits/themes/loops/progress.
 */
export function chunkSnapshot(stateJson: Record<string, unknown>): ChunkInput[] {
  const summary = typeof stateJson.summary === "string" ? stateJson.summary.trim() : null;
  let text: string;
  if (summary && summary.length > 0) {
    text = summary;
  } else {
    const parts: string[] = [];
    if (stateJson.traits && typeof stateJson.traits === "object" && Object.keys(stateJson.traits as object).length > 0) {
      parts.push(`Traits: ${JSON.stringify(stateJson.traits)}`);
    }
    if (Array.isArray(stateJson.themes) && stateJson.themes.length > 0) {
      parts.push(`Themes: ${(stateJson.themes as unknown[]).slice(0, 5).join(", ")}`);
    }
    if (Array.isArray(stateJson.loops) && stateJson.loops.length > 0) {
      parts.push(`Loops: ${(stateJson.loops as unknown[]).slice(0, 5).join(", ")}`);
    }
    if (stateJson.progress && typeof stateJson.progress === "object") {
      parts.push(`Progress: ${JSON.stringify(stateJson.progress)}`);
    }
    const meta = stateJson.metadata as { window_start?: string; window_end?: string } | undefined;
    if (meta?.window_start) parts.push(`Window: ${meta.window_start} to ${meta.window_end ?? ""}`);
    text = parts.join("\n") || "No summary available.";
  }
  const normalized = normalize(text);
  const content = normalized.length > MAX_CHUNK_CHARS ? normalized.slice(0, MAX_CHUNK_CHARS) : normalized;
  if (!content) return [];
  return [
    {
      chunk_index: 0,
      content,
      content_hash: hashContent(content),
      token_estimate: tokenEstimate(content),
    },
  ];
}
