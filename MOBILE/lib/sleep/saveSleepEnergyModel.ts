import { writeLocalJSON } from "@/lib/local/safeLocalStore";
import { ensureUserId } from "@/lib/local/ensureUserId";

export async function saveSleepEnergyModel(userId: string | undefined, model: unknown) {
  const uid = ensureUserId(userId);
  writeLocalJSON(`sleep_energy_model:${uid}`, model);
}

