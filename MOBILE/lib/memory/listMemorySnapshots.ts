import { listLocalMemorySnapshots } from "@/lib/local/memorySnapshotsLocal";

export async function listMemorySnapshots(userId?: string, limit = 5) {
  return listLocalMemorySnapshots(userId, limit);
}

