import type { SupportedLanguage } from "./languageProfiles";

export function detectLanguage(text: string): SupportedLanguage {
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[а-яА-ЯёЁ]/.test(text)) return "ru";
  if (/[ぁ-んァ-ン]/.test(text)) return "ja";
  if (/[가-힣]/.test(text)) return "ko";
  if (/[ء-ي]/.test(text)) return "ar";
  if (/¿|¡|ñ/.test(text)) return "es";
  if (/ç|é|à|è|ù/.test(text)) return "fr";
  if (/[äöüß]/i.test(text)) return "de";
  if (/õ|å|ø/.test(text)) return "no";
  if (/å|ä|ö/.test(text) && /[a-z]/i.test(text)) return "sv";
  if (/ł|ż|ź|ą|ę/.test(text)) return "pl";
  if (/ş|ğ|ı/.test(text)) return "tr";
  if (/î|â|ă|ș|ț/.test(text)) return "ro";
  if (/č|š|ž/.test(text)) return "cs";
  if (/ß/.test(text)) return "de";
  if (/đ/.test(text)) return "vi";
  return "en";
}

