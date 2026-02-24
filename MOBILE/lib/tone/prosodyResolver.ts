// DIAGNOSTICS ONLY — This file must NEVER influence realtime voice delivery.
// All voice behaviour is controlled exclusively by personaSynth + vellaRealtimeConfig.
// Prosody resolution is for local diagnostics only, not sent to API or used in instructions.

import { PROSODY_PRESETS, type ProsodyVector } from "./prosodyVectors";

export function resolveProsody(userEmotion: string): ProsodyVector {
  switch (userEmotion) {
    case "sad":
      return PROSODY_PRESETS.comforting;
    case "overwhelmed":
      return PROSODY_PRESETS.calm;
    case "excited":
      return PROSODY_PRESETS.excited;
    case "motivated":
      return PROSODY_PRESETS.encouraging;
    default:
      return PROSODY_PRESETS.neutral;
  }
}

