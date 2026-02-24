import { writeLocalJSON } from "@/lib/local/safeLocalStore";
import { ensureUserId } from "@/lib/local/ensureUserId";

export async function saveVellaWorld(userId: string | undefined, state: unknown) {
  writeLocalJSON(`vella_world_state:${ensureUserId(userId)}`, state);
}

