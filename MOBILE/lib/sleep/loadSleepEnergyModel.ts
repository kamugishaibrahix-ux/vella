import { readLocalJSON } from "@/lib/local/safeLocalStore";
import { ensureUserId } from "@/lib/local/ensureUserId";

export async function loadSleepEnergyModel(userId: string | undefined) {
  const uid = ensureUserId(userId);
  return readLocalJSON(`sleep_energy_model:${uid}`, {});
}

