import type { UILanguageCode } from "./types";
import { defaultUILanguage } from "./config";

/**
 * Phase 4: English-only. No cookie or Accept-Language detection.
 * Always returns "en".
 */
export function resolveServerLocale(): UILanguageCode {
  return defaultUILanguage;
}

export function getServerLocale(): UILanguageCode {
  return resolveServerLocale();
}

/**
 * Normalizes a locale string to 2-letter format. Always returns "en" in Phase 4.
 */
export function normalizeLocale(_locale: string | null | undefined): UILanguageCode {
  return defaultUILanguage;
}
