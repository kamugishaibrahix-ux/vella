import type { ConversationMessage } from "@/lib/memory/conversation";
import type { MemoryProfile, DailyCheckIn } from "@/lib/memory/types";

export function buildMemoryContext(args: {
  recentMessages: ConversationMessage[];
  threadSummary: string | null;
  patternsSummary: string | null;
}): string {
  const recentPart =
    args.recentMessages.length > 0
      ? args.recentMessages.map(formatMessageLine).join("\n")
      : "No stored messages yet.";
  const summaryPart = args.threadSummary ?? "No prior summary yet.";
  const patternPart = args.patternsSummary ?? "Not enough emotional pattern data yet.";

  return [
    "Recent messages:",
    recentPart,
    "",
    "Thread summary:",
    summaryPart,
    "",
    "Emotional patterns:",
    patternPart,
  ].join("\n");
}

export function getLatestCheckin(profile: MemoryProfile): DailyCheckIn | null {
  const entries = profile.dailyCheckIns ?? [];
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => {
    const aKey = (a.createdAt ?? a.date ?? "").toString();
    const bKey = (b.createdAt ?? b.date ?? "").toString();
    return bKey.localeCompare(aKey);
  });
  return sorted[0] ?? null;
}

export function describeCheckinMood(checkin: DailyCheckIn | null): string | null {
  if (!checkin) return null;
  if ((checkin.stress ?? 0) >= 7 || (checkin.mood ?? 0) <= 3) {
    return "stressed";
  }
  if ((checkin.mood ?? 0) >= 7 && (checkin.energy ?? 0) >= 6) {
    return "energised";
  }
  if ((checkin.mood ?? 0) >= 5) {
    return "steady";
  }
  return "tender";
}

function formatMessageLine(message: ConversationMessage): string {
  const speaker = message.role === "assistant" ? "vella" : "user";
  const trimmed = truncateContent(message.content);
  return `- ${speaker}: ${trimmed}`;
}

function truncateContent(content: string, maxLength = 220): string {
  if (!content) return "";
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength)}…`;
}

