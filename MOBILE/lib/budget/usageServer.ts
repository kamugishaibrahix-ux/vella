/**
 * Server-side usage persistence to Supabase.
 * Stores only safe metadata: user_id, source, tokens, from_allocation, created_at.
 * No prompts, no content.
 */
import type { Database } from "@/lib/supabase/types";
import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeDbCall, isDbUnavailableError } from "@/lib/server/safeDbCall";
import { safeInsert } from "@/lib/safe/safeSupabaseWrite";

type TokenUsageInsert = Database["public"]["Tables"]["token_usage"]["Insert"];
type TokenUsageRow = Database["public"]["Tables"]["token_usage"]["Row"];

export type UsageChannel = "text" | "realtime_voice" | "audio";

export interface ServerUsageRecord {
  userId: string;
  channel: UsageChannel;
  textTokens?: number;
  realtimeSeconds?: number;
  audioClips?: number;
  route?: string;
  featureKey?: string; // From costSchedule.ts FeatureKey for auditing
  fromAllocation: boolean;
}

/**
 * Record usage to Supabase token_usage. Source format: usage:channel:route
 * Tokens stored: text=raw, voice=seconds*20, audio=clips*5000 (for aggregation).
 * Category stores feature_key for auditing (e.g., "chat_text", "insights_generate").
 */
export async function recordUsageToSupabase(record: ServerUsageRecord): Promise<void> {
  let tokens = 0;
  let source = `usage:${record.channel}`;
  if (record.route) source += `:${record.route}`;

  if (record.channel === "text") {
    tokens = Math.max(0, Math.round(record.textTokens ?? 0));
  } else if (record.channel === "realtime_voice") {
    tokens = Math.max(0, Math.round((record.realtimeSeconds ?? 0) * 20));
  } else if (record.channel === "audio") {
    const clips = Math.max(0, record.audioClips ?? 0);
    tokens = clips * 5000;
    tokens += Math.max(0, Math.round(record.textTokens ?? 0));
  }

  if (tokens <= 0) return;

  try {
    if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
    const row: TokenUsageInsert = {
      user_id: record.userId,
      source,
      category: record.featureKey ?? null, // Store feature key for auditing
      tokens,
      from_allocation: record.fromAllocation,
    };
    const insertResult = await safeDbCall(
      () => safeInsert("token_usage", row as Record<string, unknown>, undefined, supabaseAdmin),
      { operation: "recordUsageToSupabase", table: "token_usage" },
    );
    const { error } = insertResult as { error: { message: string } | null };
    if (error) throw new Error(error.message);
  } catch (err) {
    if (isDbUnavailableError(err)) throw err;
    console.error("[usageServer] Failed to record usage", err);
    throw err;
  }
}

export interface AggregatedUsage {
  textUsed: number;
  voiceSecondsUsed: number;
  audioClipsUsed: number;
}

/**
 * Aggregate usage from token_usage for a user within the current calendar month (UTC).
 */
export async function getServerUsageForUser(userId: string): Promise<AggregatedUsage> {
  const empty = { textUsed: 0, voiceSecondsUsed: 0, audioClipsUsed: 0 };
  try {
    const now = new Date();
    const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const queryResult = await safeDbCall(
      async () =>
        await fromSafe("token_usage")
          .select("source, tokens")
          .eq("user_id", userId)
          .gte("created_at", monthStartIso),
      { operation: "getServerUsageForUser", table: "token_usage" },
    );
    const { data, error } = queryResult as { data: Pick<TokenUsageRow, "source" | "tokens">[] | null; error: { message: string } | null };

    if (error) {
      console.error("[usageServer] Failed to fetch usage", error);
      return empty;
    }

    let textUsed = 0;
    let voiceSecondsUsed = 0;
    let audioClipsUsed = 0;

    const rows = (data ?? []) as Pick<TokenUsageRow, "source" | "tokens">[];
    for (const row of rows) {
      const src = String(row.source ?? "");
      const tok = Number(row.tokens ?? 0);
      if (src.startsWith("usage:text:")) {
        textUsed += tok;
      } else if (src.startsWith("usage:realtime_voice:")) {
        voiceSecondsUsed += tok / 20;
      } else if (src.startsWith("usage:audio:")) {
        audioClipsUsed += tok / 5000;
      }
    }

    return { textUsed, voiceSecondsUsed, audioClipsUsed };
  } catch (err) {
    if (isDbUnavailableError(err)) return empty;
    console.error("[usageServer] getServerUsageForUser error", err);
    return empty;
  }
}
