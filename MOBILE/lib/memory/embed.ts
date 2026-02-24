/**
 * Phase 6C: OpenAI embeddings for memory chunks. Kill switch + retry + timeout.
 */

import { isAIDisabled } from "@/lib/security/killSwitch";
import { openai } from "@/lib/ai/client";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_RETRIES = 2;

export class AIDisabledError extends Error {
  constructor() {
    super("AI_DISABLED");
    this.name = "AIDisabledError";
  }
}

/**
 * Embed texts via OpenAI. Respects kill switch; retries transient errors up to MAX_RETRIES.
 * Returns array of float[] in same order as input.
 */
export async function embedText(texts: string[]): Promise<number[][]> {
  if (isAIDisabled()) {
    throw new AIDisabledError();
  }
  const client = openai;
  if (!client) {
    throw new Error("OPENAI_NOT_CONFIGURED");
  }
  if (texts.length === 0) return [];

  const run = async (): Promise<number[][]> => {
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      encoding_format: "float",
    });
    const order = res.data.sort((a, b) => a.index - b.index);
    return order.map((d) => (d.embedding as number[]).slice());
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (err instanceof AIDisabledError) throw err;
      const isRetryable =
        (err as { code?: string; status?: number }).code === "ECONNRESET" ||
        (err as { code?: string }).code === "ETIMEDOUT" ||
        (err as { status?: number }).status === 429 ||
        (err as Error).name === "AbortError";
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
    }
  }
  throw lastError;
}

export function getEmbeddingModelName(): string {
  return EMBEDDING_MODEL;
}
