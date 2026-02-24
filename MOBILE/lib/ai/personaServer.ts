"use server";

import { serverLocalGet } from "@/lib/local/serverLocal";
import type { TonePreference, MemoryProfile } from "@/lib/memory/types";
import { DEFAULT_VELLA_VOICE_ID, type VellaVoiceId } from "@/lib/voice/vellaVoices";
import type { SupportedLanguage } from "@/lib/ai/language/languageProfiles";

export type ServerPersonaSettings = {
  voiceModel: VellaVoiceId;
  tone: TonePreference;
  toneStyle: TonePreference;
  relationshipMode: MemoryProfile["relationshipMode"];
  language?: SupportedLanguage;
};

export async function loadServerPersonaSettings(
  userId: string | null,
): Promise<ServerPersonaSettings | null> {
  if (!userId) return null;
  try {
    const [settings, profile] = await Promise.all([
      serverLocalGet(`vella_settings:${userId}`),
      serverLocalGet(`profiles:${userId}`),
    ]);

    const typedSettings = settings as {
      voice_model?: string;
      tone?: string;
      tone_style?: string;
      language?: string;
    } | null;
    const typedProfile = profile as {
      app_language?: string;
    } | null;

    const vellaLanguage = (typedSettings?.language as SupportedLanguage | undefined) ?? undefined;
    const profileLanguage = (typedProfile?.app_language as SupportedLanguage | undefined) ?? undefined;
    const effectiveLanguage = vellaLanguage ?? profileLanguage ?? ("en" as SupportedLanguage);
    // NOTE: Language resolves via vella_settings → profiles.app_language → "en" fallback.

    return {
      voiceModel: (typedSettings?.voice_model as VellaVoiceId) ?? DEFAULT_VELLA_VOICE_ID,
      tone: (typedSettings?.tone as TonePreference) ?? "soft",
      toneStyle:
        (typedSettings?.tone_style as TonePreference) ?? (typedSettings?.tone as TonePreference) ?? "soft",
      relationshipMode: "best_friend",
      language: effectiveLanguage,
    };
  } catch (error) {
    console.warn("[personaServer] loadServerPersonaSettings error", error);
    return null;
  }
}

export async function resolvePersonaLanguage(userId: string | null): Promise<SupportedLanguage> {
  const settings = await loadServerPersonaSettings(userId);
  return (settings?.language as SupportedLanguage | undefined) ?? ("en" as SupportedLanguage);
}

