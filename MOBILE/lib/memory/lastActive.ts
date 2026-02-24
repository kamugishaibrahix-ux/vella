// Local-first last active tracking using localStorage
// Client-side safe - no Supabase dependency

export async function updateLastActive(): Promise<void> {
  try {
    const now = Date.now();
    localStorage.setItem("vella_last_active_at", String(now));
  } catch (err) {
    // silent fallback
  }
}

export async function getDaysSinceLastActive(): Promise<number> {
  try {
    const raw = localStorage.getItem("vella_last_active_at");
    if (!raw) return 0;

    const last = Number(raw);
    if (Number.isNaN(last)) return 0;

    const diff = Date.now() - last;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  } catch (err) {
    // silent fallback
    return 0;
  }
}

export function getUserLastActive(userId: string): number {
  // read local timestamp
  const key = `vella_last_active:${userId}`;
  const value = localStorage.getItem(key);
  return value ? Number(value) : Date.now();
}

export function setUserLastActive(userId: string): void {
  const key = `vella_last_active:${userId}`;
  localStorage.setItem(key, String(Date.now()));
}
