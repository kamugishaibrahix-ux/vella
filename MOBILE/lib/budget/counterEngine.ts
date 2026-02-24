/**
 * Monthly/Daily Usage Counter Engine (Safe Mode)
 * 
 * Pure, deterministic, read-only counter engine that computes usage from localStorage.
 * 
 * HARD REQUIREMENTS:
 * - NO Supabase writes
 * - NO backend persistence
 * - ALL counters live in localStorage only
 * - Counters reset automatically at monthly/daily boundaries (user-local time)
 * - Safe-mode only — zero enforcement, zero blocking
 * - Must not break any existing logic
 * 
 * SOURCES OF TRUTH:
 * - logTokenUsage.ts entries (TokenUsageEntry)
 * - session voice logs from useRealtimeVella (via recordUsage)
 * - telemetry values fed through recordUsage()
 */

import { loadLocal } from "@/lib/local/storage";
import { getPlanLimits } from "@/lib/tiers/tierLimits";
import type { PlanTier } from "@/lib/tiers/tierLimits";

/**
 * Token usage entry structure (matches logTokenUsage.ts)
 * 
 * Structured fields (channel, text_tokens, realtime_seconds, audio_clips) are stored
 * directly by recordUsage() -> logTokenUsage(). Older entries may not have these fields.
 */
type TokenUsageEntry = {
  id: string;
  user_id: string;
  source: string; // Format: "usage:channel:route" or "usage:channel" (legacy)
  tokens: number;
  from_allocation: boolean;
  created_at: string; // ISO timestamp
  // Structured fields (new format - may be missing in older entries)
  channel?: "text" | "realtime_voice" | "audio";
  text_tokens?: number;
  realtime_seconds?: number;
  audio_clips?: number;
  route?: string;
};

/**
 * Parsed usage entry with channel breakdown
 * Uses structured fields directly from TokenUsageEntry
 */
type ParsedUsageEntry = {
  channel: "text" | "realtime_voice" | "audio";
  route?: string;
  textTokens: number;
  realtimeSeconds: number;
  audioClips: number;
  timestamp: Date;
};

/**
 * Monthly counter state
 */
export interface MonthlyCounters {
  textUsed: number;
  textRemaining: number;
  voiceSecondsUsed: number;
  voiceSecondsRemaining: number;
  audioClipsUsed: number;
  audioClipsRemaining: number;
}

/**
 * Daily counter state
 */
export interface DailyCounters {
  textUsedToday: number;
  voiceSecondsUsedToday: number;
  audioClipsUsedToday: number;
}

/**
 * Warning state
 */
export interface CounterWarnings {
  nearingLimit: boolean; // 80% threshold
  atLimit: boolean; // 100% threshold
}

/**
 * Complete counter state
 */
export interface CounterState {
  monthly: MonthlyCounters;
  daily: DailyCounters;
  warnings: CounterWarnings;
}

/**
 * Usage window boundaries
 */
interface UsageWindow {
  monthlyStart: Date; // 30 days ago
  monthlyEnd: Date; // Now
  dailyStart: Date; // Start of current day (user-local)
  dailyEnd: Date; // End of current day (user-local)
}

/**
 * Loads usage entries from localStorage for a user.
 * Handles missing/corrupted data gracefully.
 */
function loadUsageWindow(userId: string): TokenUsageEntry[] {
  if (!userId) {
    return [];
  }

  try {
    const key = `vella_token_usage:${userId}`;
    const entries = loadLocal<TokenUsageEntry[]>(key, []);

    if (!Array.isArray(entries)) {
      console.warn("[CounterEngine] Invalid usage entries format, returning empty array");
      return [];
    }

    // Filter out invalid entries
    return entries.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (!entry.created_at || typeof entry.created_at !== "string") return false;
      if (typeof entry.tokens !== "number" || entry.tokens <= 0) return false;
      if (!entry.source || typeof entry.source !== "string") return false;
      return true;
    });
  } catch (error) {
    console.warn("[CounterEngine] Error loading usage window:", error);
    return [];
  }
}

/**
 * Parses a usage entry source string to extract channel and route.
 * 
 * This is ONLY used as a fallback for older entries that don't have structured fields.
 * New entries should have channel/route fields directly.
 * 
 * Source format: "usage:channel:route" or "usage:channel"
 */
function parseUsageSource(source: string): { channel: "text" | "realtime_voice" | "audio"; route?: string } {
  if (!source || typeof source !== "string") {
    return { channel: "text" };
  }

  const parts = source.split(":");
  if (parts.length < 2 || parts[0] !== "usage") {
    return { channel: "text" };
  }

  const channel = parts[1] as "text" | "realtime_voice" | "audio";
  const route = parts.length > 2 ? parts.slice(2).join(":") : undefined;

  // Validate channel
  if (channel !== "text" && channel !== "realtime_voice" && channel !== "audio") {
    return { channel: "text" };
  }

  return { channel, route };
}

/**
 * Converts token usage entry to parsed breakdown.
 * 
 * Uses structured fields directly from TokenUsageEntry.
 * For older entries without structured fields, falls back to parsing source string
 * and treats them as text-only (safer than reverse-engineering).
 */
function parseUsageEntry(entry: TokenUsageEntry): ParsedUsageEntry | null {
  try {
    const timestamp = new Date(entry.created_at);
    
    // Validate timestamp
    if (isNaN(timestamp.getTime())) {
      return null;
    }

    // Prefer structured fields if available (new format)
    if (entry.channel) {
      return {
        channel: entry.channel,
        route: entry.route,
        textTokens: Math.max(0, entry.text_tokens ?? 0),
        realtimeSeconds: Math.max(0, entry.realtime_seconds ?? 0),
        audioClips: Math.max(0, entry.audio_clips ?? 0),
        timestamp,
      };
    }

    // Fallback for older entries without structured fields
    // Since we can't safely reverse-engineer breakdown from token totals,
    // we skip these entries to ensure accuracy.
    // Only entries with structured fields (channel, text_tokens, etc.) are counted.
    // This means old entries created before structured logging won't appear in counters,
    // but all new entries will be accurately tracked.
    return null;
  } catch (error) {
    console.warn("[CounterEngine] Error parsing usage entry:", error);
    return null;
  }
}

/**
 * Computes usage window boundaries based on user-local time.
 * 
 * Monthly: last 30 days
 * Daily: current day (user-local midnight to midnight)
 */
function computeUsageWindow(): UsageWindow {
  const now = new Date();
  
  // Monthly: last 30 days
  const monthlyEnd = now;
  const monthlyStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Daily: current day boundaries (user-local)
  const dailyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const dailyEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  return {
    monthlyStart,
    monthlyEnd,
    dailyStart,
    dailyEnd,
  };
}

/**
 * Filters parsed entries by time window.
 */
function filterByWindow(
  entries: ParsedUsageEntry[],
  window: UsageWindow,
  period: "monthly" | "daily"
): ParsedUsageEntry[] {
  const start = period === "monthly" ? window.monthlyStart : window.dailyStart;
  const end = period === "monthly" ? window.monthlyEnd : window.dailyEnd;

  return entries.filter((entry) => {
    return entry.timestamp >= start && entry.timestamp <= end;
  });
}

/**
 * Computes monthly counters from parsed usage entries.
 */
function computeMonthlyCounters(
  userId: string,
  planTier: PlanTier
): MonthlyCounters {
  const entries = loadUsageWindow(userId);
  const parsed = entries
    .map(parseUsageEntry)
    .filter((e): e is ParsedUsageEntry => e !== null);

  const window = computeUsageWindow();
  const monthlyEntries = filterByWindow(parsed, window, "monthly");

  // Aggregate usage
  let textUsed = 0;
  let voiceSecondsUsed = 0;
  let audioClipsUsed = 0;

  for (const entry of monthlyEntries) {
    textUsed += entry.textTokens;
    voiceSecondsUsed += entry.realtimeSeconds;
    audioClipsUsed += entry.audioClips;
  }

  // Get plan limits
  const limits = getPlanLimits(planTier);
  const textRemaining = Math.max(0, limits.monthlyTextTokens - textUsed);
  const voiceSecondsRemaining = Math.max(0, limits.monthlyVoiceMinutes * 60 - voiceSecondsUsed);
  const audioClipsRemaining = Math.max(0, limits.monthlyAudioClips - audioClipsUsed);

  return {
    textUsed,
    textRemaining,
    voiceSecondsUsed,
    voiceSecondsRemaining,
    audioClipsUsed,
    audioClipsRemaining,
  };
}

/**
 * Computes daily counters from parsed usage entries.
 */
function computeDailyCounters(
  userId: string,
  planTier: PlanTier
): DailyCounters {
  const entries = loadUsageWindow(userId);
  const parsed = entries
    .map(parseUsageEntry)
    .filter((e): e is ParsedUsageEntry => e !== null);

  const window = computeUsageWindow();
  const dailyEntries = filterByWindow(parsed, window, "daily");

  // Aggregate usage
  let textUsedToday = 0;
  let voiceSecondsUsedToday = 0;
  let audioClipsUsedToday = 0;

  for (const entry of dailyEntries) {
    textUsedToday += entry.textTokens;
    voiceSecondsUsedToday += entry.realtimeSeconds;
    audioClipsUsedToday += entry.audioClips;
  }

  return {
    textUsedToday,
    voiceSecondsUsedToday,
    audioClipsUsedToday,
  };
}

/**
 * Computes warning state based on monthly counters and plan limits.
 */
function computeWarnings(
  monthly: MonthlyCounters,
  planTier: PlanTier
): CounterWarnings {
  const limits = getPlanLimits(planTier);
  
  // Check if nearing limit (80% threshold)
  const textAt80Percent = monthly.textUsed >= limits.monthlyTextTokens * 0.8;
  const voiceAt80Percent = limits.monthlyVoiceMinutes > 0 && 
    monthly.voiceSecondsUsed >= (limits.monthlyVoiceMinutes * 60 * 0.8);
  const audioAt80Percent = limits.monthlyAudioClips > 0 && 
    monthly.audioClipsUsed >= limits.monthlyAudioClips * 0.8;
  
  const nearingLimit = textAt80Percent || voiceAt80Percent || audioAt80Percent;

  // Check if at limit (100% threshold)
  const textAtLimit = monthly.textRemaining <= 0;
  const voiceAtLimit = limits.monthlyVoiceMinutes > 0 && monthly.voiceSecondsRemaining <= 0;
  const audioAtLimit = limits.monthlyAudioClips > 0 && monthly.audioClipsRemaining <= 0;
  
  const atLimit = textAtLimit || voiceAtLimit || audioAtLimit;

  return {
    nearingLimit,
    atLimit,
  };
}

/**
 * Computes all counters (monthly + daily + warnings).
 * 
 * This is the main entry point for getting counter state.
 */
export function computeAllCounters(
  userId: string,
  planTier: PlanTier
): CounterState {
  const monthly = computeMonthlyCounters(userId, planTier);
  const daily = computeDailyCounters(userId, planTier);
  const warnings = computeWarnings(monthly, planTier);

  return {
    monthly,
    daily,
    warnings,
  };
}

/**
 * Gets counter state (alias for computeAllCounters for convenience).
 */
export function getCounterState(
  userId: string,
  planTier: PlanTier
): CounterState {
  return computeAllCounters(userId, planTier);
}

/**
 * Exported helper functions for specific use cases.
 */
export { computeMonthlyCounters, computeDailyCounters, loadUsageWindow };

