import { readLocalJSON } from "@/lib/local/safeLocalStore";
import { ensureUserId } from "@/lib/local/ensureUserId";

export type ShortTermMemoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ShortTermMemoryState = {
  history: ShortTermMemoryMessage[];
};

const DEFAULT_MEMORY: ShortTermMemoryState = {
  history: [],
};

export async function loadShortTermMemory(userId: string | undefined): Promise<ShortTermMemoryState> {
  const result = readLocalJSON<ShortTermMemoryState | null>(`short_term_memory:${ensureUserId(userId)}`, null);
  if (!result) return DEFAULT_MEMORY;
  return {
    history: Array.isArray(result?.history) ? result.history : [],
  };
}

