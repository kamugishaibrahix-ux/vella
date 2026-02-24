import { writeLocalJSON } from "@/lib/local/safeLocalStore";
import { ensureUserId } from "@/lib/local/ensureUserId";
import type { ShortTermMemoryState } from "./loadShortTermMemory";

export async function saveShortTermMemory(userId: string | undefined, payload: ShortTermMemoryState) {
  writeLocalJSON(`short_term_memory:${ensureUserId(userId)}`, payload);
}

