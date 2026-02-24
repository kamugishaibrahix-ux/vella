export function isExpired(timestamp: number | null | undefined, days: number): boolean {
  if (!timestamp) return false;
  const ms = days * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp > ms;
}

