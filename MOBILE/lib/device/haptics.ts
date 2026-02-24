export function tryLightHaptic() {
  if (typeof window === "undefined") return;
  const nav = window.navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  if (!nav?.vibrate) return;
  try {
    nav.vibrate(30);
  } catch {
    // ignore failures silently
  }
}


