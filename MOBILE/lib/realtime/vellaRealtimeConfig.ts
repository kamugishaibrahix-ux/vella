/**
 * Single source of truth for Vella's realtime voice configuration.
 * 
 * This configuration ensures voice stability and consistency across the entire session.
 * Model, temperature, topP, and audio format are frozen and cannot be changed at runtime.
 * 
 * Voice selection remains user-configurable but defaults to the value specified here.
 * 
 * Admin config can influence voice parameters via loadRuntimeTuning().
 */
import { loadRuntimeTuning } from "@/lib/admin/runtimeTuning";

export type VellaRealtimeVoiceConfig = {
  model: string;
  voice: string;
  modalities: ("audio" | "text")[];
  outputAudioFormat: string;
  temperature: number;
  topP: number;
  maxOutputTokens?: number | "inf";
};

const ALLOWED_REALTIME_MODELS = new Set([
  "gpt-4o-realtime-preview",
  "gpt-4o-realtime-mini",
  "gpt-4o-mini",
]);

function isAllowedRealtimeModel(model: string): boolean {
  return ALLOWED_REALTIME_MODELS.has(model);
}

/**
 * Gets the realtime voice config, optionally blending in admin tuning.
 * This function is async to support admin config loading, but returns a stable config.
 */
export async function getVellaRealtimeVoiceConfig(): Promise<Readonly<VellaRealtimeVoiceConfig>> {
  const baseConfig: VellaRealtimeVoiceConfig = {
    model: "gpt-4o-realtime-preview",
    voice: "alloy",
    modalities: ["audio", "text"] as ("audio" | "text")[],
    outputAudioFormat: "pcm16",
    temperature: 0.8,
    topP: 0.9,
    maxOutputTokens: "inf",
  };

  try {
    const tuning = await loadRuntimeTuning();
    
    // Apply admin model override if valid
    if (tuning.models.realtimeModel && isAllowedRealtimeModel(tuning.models.realtimeModel)) {
      baseConfig.model = tuning.models.realtimeModel;
    }
    
    // Blend admin generation parameters (gentle blend to maintain stability)
    baseConfig.temperature = Math.max(
      0.7,
      Math.min(0.9, (baseConfig.temperature * 0.7 + tuning.generation.temperature * 0.3)),
    );
    baseConfig.topP = Math.max(
      0.8,
      Math.min(0.95, (baseConfig.topP * 0.7 + tuning.generation.topP * 0.3)),
    );
  } catch {
    // Fall back to base config if admin tuning fails
  }

  return Object.freeze(baseConfig);
}

// Legacy export for backward compatibility - uses defaults
export const VELLA_REALTIME_VOICE_CONFIG: Readonly<VellaRealtimeVoiceConfig> = Object.freeze({
  model: "gpt-4o-realtime-preview",
  voice: "alloy",
  modalities: ["audio", "text"] as ("audio" | "text")[],
  outputAudioFormat: "pcm16",
  temperature: 0.8,
  topP: 0.9,
  maxOutputTokens: "inf",
});

/**
 * Fields that are safe to update at runtime (metadata only, not voice/model config).
 */
export type RealtimeSessionMutableFields = {
  input_audio_transcription?: unknown;
  speech_cadence?: unknown;
  breath_event?: unknown;
  plan_hint?: unknown;
  prewarm_intent?: unknown;
  predicted_intent?: unknown;
  // Add ONLY fields that are safe to update at runtime
};

/**
 * Persona, model, voice and audio format may NOT be changed at runtime.
 * These must only be set during initial session creation.
 */
export type ForbiddenRealtimeSessionFields = never;

