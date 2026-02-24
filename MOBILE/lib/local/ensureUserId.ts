// Shared helper to ensure a userId exists, falling back to anonymous device ID
import { loadLocal, saveLocal } from "./storage";

export function ensureUserId(userId?: string | null): string {
  if (userId) return userId;
  let anon = loadLocal<string>("anonUserId");
  if (!anon) {
    anon = crypto.randomUUID();
    saveLocal("anonUserId", anon);
  }
  return anon;
}

