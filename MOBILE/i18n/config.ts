import type { Dictionary, UILanguageCode } from "./types";

export const supportedLanguages: UILanguageCode[] = ["en", "es", "fr", "pt", "ar", "ja"];

export const defaultUILanguage: UILanguageCode = "en";

export const LANGUAGE_LABELS: Record<UILanguageCode, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  ar: "العربية",
  ja: "日本語",
};

/** Phase 4: English-only. Single loader; no runtime dynamic import of other locales. */
const enLoader = (): Promise<{ default: Dictionary }> => import("./dictionaries/en");

export function isRTL(lang: UILanguageCode): boolean {
  return lang === "ar";
}

/** Always returns the English dictionary. Other locales are not loaded at runtime. */
export async function getDictionary(_lang?: UILanguageCode): Promise<Dictionary> {
  const mod = await enLoader();
  return mod.default;
}

export type { UILanguageCode };
