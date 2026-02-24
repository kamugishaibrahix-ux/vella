import { writeLocalJSON } from "@/lib/local/safeLocalStore";
import { ensureUserId } from "@/lib/local/ensureUserId";

export async function saveBehaviourMap(userId: string | undefined, map: unknown) {
  writeLocalJSON(`behaviour_map:${ensureUserId(userId)}`, map);
}

