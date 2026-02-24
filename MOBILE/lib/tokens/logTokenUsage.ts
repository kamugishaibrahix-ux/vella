import { loadLocal, saveLocal } from "@/lib/local/storage";
import { TokenError } from "./tokenErrors";

type LogTokenUsageOptions = {
  userId: string;
  tokens: number;
  event: string;
  fromAllocation: boolean;
  // Structured usage fields (for counter engine)
  channel?: "text" | "realtime_voice" | "audio";
  textTokens?: number;
  realtimeSeconds?: number;
  audioClips?: number;
  route?: string;
};

type TokenUsageEntry = {
  id: string;
  user_id: string;
  source: string;
  tokens: number;
  from_allocation: boolean;
  created_at: string;
  // Structured usage fields (optional for backward compatibility)
  channel?: "text" | "realtime_voice" | "audio";
  text_tokens?: number;
  realtime_seconds?: number;
  audio_clips?: number;
  route?: string;
};

export async function logTokenUsage(options: LogTokenUsageOptions) {
  if (options.tokens <= 0) {
    return;
  }

  try {
    const key = `vella_token_usage:${options.userId}`;
    const existing = loadLocal<TokenUsageEntry[]>(key, []);
    const entry: TokenUsageEntry = {
      id: crypto.randomUUID(),
      user_id: options.userId,
      source: options.event,
      tokens: options.tokens,
      from_allocation: options.fromAllocation,
      created_at: new Date().toISOString(),
      // Store structured fields if provided
      channel: options.channel,
      text_tokens: options.textTokens,
      realtime_seconds: options.realtimeSeconds,
      audio_clips: options.audioClips,
      route: options.route,
    };
    const updated = [...(existing ?? []), entry];
    saveLocal(key, updated);
  } catch (err) {
    console.warn("[tokens] logTokenUsage: error logging token usage", err);
    // Silent fail - best effort only
  }
}


