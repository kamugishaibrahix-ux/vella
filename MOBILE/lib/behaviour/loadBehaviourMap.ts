import { readLocalJSON } from "@/lib/local/safeLocalStore";
import { ensureUserId } from "@/lib/local/ensureUserId";

export async function loadBehaviourMap(userId: string | undefined) {
  return readLocalJSON(`behaviour_map:${ensureUserId(userId)}`, {});
}

