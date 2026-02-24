/**
 * Server-safe Vella settings type and default.
 * No "use client"; no React. Used by API routes and server-only lib.
 */

import {
  DEFAULT_VELLA_VOICE_ID,
  type VellaVoiceId,
} from "@/lib/voice/vellaVoices";
import { RELATIONSHIP_MODES } from "@/lib/ai/persona/personaConfig";
import type { TonePreference, VoiceHudSettings } from "@/lib/memory/types";

export type VellaSettings = {
  voiceModel: VellaVoiceId;
  tone: TonePreference;
  toneStyle?: TonePreference;
  relationshipMode: keyof typeof RELATIONSHIP_MODES;
  voiceHud: VoiceHudSettings;
  privacyAnonymize?: boolean;
  privacyExcludeFromTraining?: boolean;
};

export const DEFAULT_VELLA_SETTINGS: VellaSettings = {
  voiceModel: DEFAULT_VELLA_VOICE_ID,
  tone: "soft",
  toneStyle: "soft",
  relationshipMode: "best_friend",
  voiceHud: {
    moodChip: true,
    stability: true,
    deliveryHints: true,
    sessionTime: true,
    tokenChip: true,
    strategyChip: true,
    alertChip: true,
  },
};
