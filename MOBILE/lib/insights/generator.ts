import type { DailyCheckIn, MemoryProfile } from "@/lib/memory/types";
import type { InsightCardData } from "./types";
import type { UILanguageCode } from "@/i18n/types";

export function summarizeEmotionalThemes(patterns: MemoryProfile["emotionalPatterns"]): string | null {
  const primary = patterns.commonPrimaryEmotions.slice(0, 3);
  const triggers = patterns.commonTriggers.slice(0, 3);

  if (primary.length === 0 && triggers.length === 0) return null;

  const parts: string[] = [];
  if (primary.length > 0) {
    parts.push(`emotions like ${primary.join(", ")}`);
  }
  if (triggers.length > 0) {
    parts.push(`often sparked by ${triggers.join(", ")}`);
  }

  return `Recent emotional themes show ${parts.join(" and ")}.`;
}


export function buildInsightPrompt({
  checkins,
  patterns,
  timezone,
  locale = "en",
}: {
  checkins: DailyCheckIn[];
  patterns?: MemoryProfile["emotionalPatterns"];
  timezone?: string | null;
  locale?: UILanguageCode;
}) {
  const condensed = checkins.slice(0, 10).map((entry) => ({
    date: entry.date,
    mood: entry.mood,
    stress: entry.stress,
    focus: entry.focus,
    energy: entry.energy,
    note: entry.note,
  }));
  
  // Normalize locale to 2-letter format
  const normalizedLocale = locale?.slice(0, 2).toLowerCase() || "en";
  
  const languageInstruction = normalizedLocale !== "en" 
    ? `\n\n🚨 CRITICAL LANGUAGE REQUIREMENT 🚨
You MUST respond ONLY in ${normalizedLocale.toUpperCase()}.
DO NOT use English unless ${normalizedLocale} is 'en'.
All titles, bodies, actions, and any text MUST be in ${normalizedLocale}.
If you use English when ${normalizedLocale} is not 'en', the response will be invalid.\n\n`
    : "";
  
  return `${languageInstruction}Timezone: ${timezone ?? "unknown"}.
Check-ins: ${JSON.stringify(condensed)}.
Patterns: ${JSON.stringify(patterns ?? null)}.
Return JSON array of 2-3 concise insights.
Each insight must include title, body, action, and moodTag (today|pattern|identity).`;
}

export function buildLiteInsights(checkins: DailyCheckIn[]): InsightCardData[] {
  const upgradeNote = "Upgrade for deeper personalised insights.";
  if (!checkins || checkins.length === 0) {
    const message = "As you log more check-ins, I can reflect clearer patterns back to you.";
    return [
      {
        id: "insight-lite-empty",
        kind: "lite",
        title: "Lite insight preview",
        body: message,
        action: "Log a quick check-in to capture how you feel right now.",
        type: "lite",
        message,
        note: upgradeNote,
      },
    ];
  }

  const recent = checkins.slice(0, 7);
  const avgMood = recent.reduce((sum, entry) => sum + entry.mood, 0) / recent.length;
  const avgStress = recent.reduce((sum, entry) => sum + entry.stress, 0) / recent.length;

  const message =
    avgMood <= 4
      ? "Across the last days, your mood has been on the lower side. It’s okay to slow down and move gently."
      : avgStress >= 6
        ? "Stress has been consistently high recently. Protect small pockets of calm deliberately."
        : "Your emotional landscape has moved, but there are signs of resilience too.";

  const action =
    avgMood <= 4
      ? "Remove one tiny obligation from your list this week."
      : avgStress >= 6
        ? "Block 5 minutes today to breathe or stretch on purpose."
        : "Write down one thing you handled better than a month ago.";

  return [
    {
      id: "insight-lite-trend",
      kind: "lite",
      title: "Lite insight preview",
      body: message,
      action,
      type: "lite",
      message,
      note: upgradeNote,
    },
  ];
}

export function mapPlan(plan: string | undefined | null): "free" | "pro" | "elite" {
  if (!plan) return "free";
  const normalized = plan.trim().toLowerCase();
  if (normalized === "elite") return "elite";
  if (normalized === "pro") return "pro";
  return "free";
}

