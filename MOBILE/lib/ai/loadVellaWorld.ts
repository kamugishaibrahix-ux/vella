import { readLocalJSON } from "@/lib/local/safeLocalStore";
import { ensureUserId } from "@/lib/local/ensureUserId";

export async function loadVellaWorld(userId: string | undefined) {
  return readLocalJSON(`vella_world_state:${ensureUserId(userId)}`, null);
}

