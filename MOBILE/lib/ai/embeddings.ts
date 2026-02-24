/**
 * Embedding model selection and creation helper.
 * 
 * This module provides a centralized way to get the embedding model
 * from admin config and create embeddings using that model.
 * 
 * All embedding calls should use getEmbeddingModel() to ensure
 * admin overrides are consistently applied.
 */

import { loadRuntimeTuning } from "@/lib/admin/runtimeTuning";
import { openai } from "./client";

// Allowed embedding models (cheap models only)
const ALLOWED_EMBEDDING_MODELS = new Set([
  "text-embedding-3-small",
  "text-embedding-3-large",
]);

// Default embedding model (used when admin config is missing or invalid)
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Gets the embedding model to use, respecting admin config overrides.
 * 
 * - If admin config specifies a valid embedding model, use it.
 * - If admin config is missing or specifies an invalid model, use default.
 * - Never throws - always returns a valid model string.
 * 
 * @returns The embedding model string to use for all embedding calls
 */
export async function getEmbeddingModel(): Promise<string> {
  try {
    const tuning = await loadRuntimeTuning();
    const adminModel = tuning.models.embeddingModel;

    // Validate that the admin model is in the allowed set
    if (adminModel && ALLOWED_EMBEDDING_MODELS.has(adminModel)) {
      return adminModel;
    }

    // If admin model is invalid or missing, log and fall back to default
    if (adminModel && !ALLOWED_EMBEDDING_MODELS.has(adminModel)) {
      // Log invalid model override (non-fatal)
      const { recordAdminRuntimeLog } = await import("@/lib/admin/runtimeEvents").catch(() => ({ recordAdminRuntimeLog: null }));
      if (recordAdminRuntimeLog) {
        recordAdminRuntimeLog({
          userId: "system", // System-level log since we don't have user context here
          level: "warn",
          source: "embeddings",
          code: "INVALID_EMBEDDING_MODEL_OVERRIDE",
          message: "Admin config specified invalid embedding model, using default",
          metadata: {
            providedModel: adminModel,
            defaultModel: DEFAULT_EMBEDDING_MODEL,
            allowedModels: Array.from(ALLOWED_EMBEDDING_MODELS),
          },
        }).catch(() => {
          // Silent fail - best effort only
        });
      }
    }

    return DEFAULT_EMBEDDING_MODEL;
  } catch (error) {
    // If loading admin config fails, fall back to default
    console.warn("[embeddings] Failed to load admin config for embedding model, using default", error);
    return DEFAULT_EMBEDDING_MODEL;
  }
}

/**
 * Creates embeddings for the given input text(s).
 * 
 * This is a convenience wrapper that ensures the correct embedding model
 * (from admin config) is used for all embedding calls.
 * 
 * @param input - Text or array of texts to embed
 * @param userId - Optional user ID for logging (if available)
 * @returns Embedding vectors or null if OpenAI client is unavailable
 */
export async function createEmbeddings(
  input: string | string[],
  userId?: string,
): Promise<number[][] | null> {
  if (!openai) {
    console.warn("[embeddings] OpenAI client not available");
    return null;
  }

  try {
    const model = await getEmbeddingModel();

    const response = await openai.embeddings.create({
      model,
      input: Array.isArray(input) ? input : [input],
    });

    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.error("[embeddings] Failed to create embeddings", error);
    
    // Log error if userId is available
    if (userId) {
      const { recordAdminRuntimeLog } = await import("@/lib/admin/runtimeEvents").catch(() => ({ recordAdminRuntimeLog: null }));
      if (recordAdminRuntimeLog) {
        recordAdminRuntimeLog({
          userId,
          level: "error",
          source: "embeddings",
          code: "EMBEDDING_CREATION_FAILED",
          message: "Failed to create embeddings",
          metadata: {
            model: await getEmbeddingModel().catch(() => DEFAULT_EMBEDDING_MODEL),
            inputCount: Array.isArray(input) ? input.length : 1,
            error: String(error),
          },
        }).catch(() => {
          // Silent fail - best effort only
        });
      }
    }

    return null;
  }
}

/**
 * Gets a single embedding vector for a text string.
 * Convenience wrapper around createEmbeddings for single inputs.
 * 
 * @param text - Text to embed
 * @param userId - Optional user ID for logging
 * @returns Embedding vector or null if creation failed
 */
export async function getEmbedding(
  text: string,
  userId?: string,
): Promise<number[] | null> {
  const embeddings = await createEmbeddings(text, userId);
  return embeddings?.[0] ?? null;
}

