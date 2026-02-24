import { saveLocalMemorySnapshot } from "@/lib/local/memorySnapshotsLocal";

export async function saveSnapshot(userId: string | undefined, snapshot: unknown) {
  return saveLocalMemorySnapshot(userId, snapshot);
}

