/**
 * AI-consuming endpoint policy: authentication and public exceptions.
 *
 * DEFAULT: All AI endpoints require authentication (requireUserId).
 * PUBLIC: If any endpoint must remain public, it MUST enforce:
 *   - strict IP rate limiting (RATE_LIMIT_CONFIG.publicAI)
 *   - strict payload limits
 *   - strict token ceiling
 *   - reduced functionality
 *
 * No client-side secret usage. All OpenAI calls server-side only.
 */

/** AI-consuming routes — all currently AUTH-REQUIRED */
export const AI_ENDPOINTS = {
  /** Text/chat: clarity, strategy, compass, emotion-intel, deepdive */
  clarity: { auth: "required" as const, rateLimitKey: "clarity" },
  strategy: { auth: "required" as const, rateLimitKey: "strategy" },
  compass: { auth: "required" as const, rateLimitKey: "compass" },
  "emotion-intel": { auth: "required" as const, rateLimitKey: "emotion-intel" },
  deepdive: { auth: "required" as const, rateLimitKey: "deepdive" },

  /** Transcription: Whisper */
  transcribe: {
    auth: "required" as const,
    rateLimitKey: "transcribe",
    /** Max file size (bytes) — Whisper API limit is 25MB */
    maxFileSizeBytes: 25 * 1024 * 1024,
    /** Allowed MIME types for uploaded audio (Whisper supports mp3, mp4, mpeg, mpga, m4a, wav, webm) */
    allowedMimeTypes: [
      "audio/mpeg",
      "audio/mp4",
      "audio/mpga",
      "audio/x-m4a",
      "audio/m4a",
      "audio/wav",
      "audio/webm",
    ] as const,
  },

  /** Insights: patterns, generate */
  "insights/patterns": { auth: "required" as const, rateLimitKey: "insights_patterns" },
  "insights/generate": { auth: "required" as const, rateLimitKey: "insights_generate" },

  /** Reflection, audio, voice, realtime */
  reflection: { auth: "required" as const, rateLimitKey: "reflection" },
  "audio/vella": { auth: "required" as const, rateLimitKey: "audio_vella" },
  "realtime/offer": { auth: "required" as const, rateLimitKey: "realtime_offer" },
} as const;

/** Routes that have NO public exception — all require auth */
export const PUBLIC_AI_ROUTES: string[] = [];
