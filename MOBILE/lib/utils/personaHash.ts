/**
 * Stable, deterministic hash for persona instruction strings.
 * This is NOT security sensitive; it is only for logging and consistency checks.
 */
export function computePersonaHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0; // Force 32-bit
  }
  // Normalize and tag with a version so we can change algorithm later if needed
  const normalized = Math.abs(hash) || 1;
  return `v1-${normalized.toString(16)}`;
}

