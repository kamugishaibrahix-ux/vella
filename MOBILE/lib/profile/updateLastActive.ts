"use server";

import { updateLastActive as updateLastActiveLocal } from "@/lib/memory/lastActive";

export async function updateLastActive(userId: string | null) {
  // Local-first: use localStorage-based lastActive tracking
  // The userId parameter is kept for interface compatibility but not used
  try {
    await updateLastActiveLocal();
  } catch (error) {
    console.error("[updateLastActive] error", error);
  }
}

