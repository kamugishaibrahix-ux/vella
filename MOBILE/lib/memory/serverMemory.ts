import type { MemoryProfile, DailyCheckIn } from "./types";
import { getRecentCheckIns as fetchRecentCheckins } from "./localMemory";

export const getRecentCheckIns = async (
  _memory: MemoryProfile | null,
  limit = 5,
): Promise<DailyCheckIn[]> => {
  return fetchRecentCheckins(limit);
};
