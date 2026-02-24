"use server";

// TODO[privacy]: This module still reads Supabase journal/checkin content.
// Once the local-only insight engine is wired, switch the data source
// to lib/local/localJournals and lib/local/localCheckins.

import { getUserPlanTier } from "@/lib/tiers/server";
import type { PlanTier } from "@/lib/tiers/tierCheck";
import { callVellaReflectionAPI } from "@/lib/ai/reflection";
import type { LocalJournalEntry } from "@/lib/local/journalLocal";

type JournalRow = LocalJournalEntry;

export type JournalTheme = {
  theme: string;
  summary: string;
  frequency: number;
};

export async function analyseJournalEntries(userId: string): Promise<JournalTheme[]> {
  if (!userId) return [];

  const [planTier, entries] = await Promise.all([
    getUserPlanTier(userId),
    fetchJournalEntries(userId),
  ]);

  if (entries.length === 0) {
    return [];
  }

  if (planTier === "free") {
    return buildLiteThemes(entries);
  }

  const payload = {
    type: "journal_patterns" as const,
    entries: entries.map((entry) => ({
      title: entry.title ?? "Untitled entry",
      content: entry.content ?? "",
      createdAt: entry.createdAt,
    })),
    planTier,
    userId,
  };

  const response = await callVellaReflectionAPI(payload);

  if (response.type === "ai_response") {
    return parseThemes(response.message);
  }

  return buildLiteThemes(entries);
}

import { listLocalJournals } from "@/lib/local/journalLocal";

async function fetchJournalEntries(userId: string): Promise<JournalRow[]> {
  try {
    const journals = listLocalJournals(userId);
    return journals.slice(0, 20);
  } catch (error) {
    // silent fallback
    return [];
  }
}

function buildLiteThemes(entries: JournalRow[]): JournalTheme[] {
  const themes: JournalTheme[] = [];
  const buckets: Record<
    string,
    {
      summary: string;
      count: number;
    }
  > = {};

  for (const entry of entries) {
    const content = (entry.content ?? "").toLowerCase();
    if (!content) continue;

    const bucketKey = findBucket(content);
    if (!bucketKey) continue;

    if (!buckets[bucketKey]) {
      buckets[bucketKey] = {
        summary: bucketSummary(bucketKey),
        count: 0,
      };
    }
    buckets[bucketKey].count += 1;
  }

  Object.entries(buckets).forEach(([theme, info]) => {
    themes.push({
      theme: titleCase(theme),
      summary: info.summary,
      frequency: info.count,
    });
  });

  if (themes.length === 0) {
    themes.push({
      theme: "Still gathering data",
      summary: "Keep journaling—once you have a few entries I’ll reflect themes back to you.",
      frequency: 0,
    });
  }

  return themes.slice(0, 4);
}

function findBucket(content: string): string | null {
  if (/(stress|overwhelm|pressure|deadline)/.test(content)) return "stress cycles";
  if (/(worthless|not enough|self-doubt|confidence)/.test(content)) return "self-worth";
  if (/(relationship|friend|family|partner|alone|lonely)/.test(content)) return "connection";
  if (/(tired|drained|energy|burnout)/.test(content)) return "energy dips";
  if (/(hopeful|grateful|progress|learning)/.test(content)) return "growth";
  return null;
}

function bucketSummary(bucket: string): string {
  switch (bucket) {
    case "stress cycles":
      return "You often unpack stress loops and how pressure builds across the week.";
    case "self-worth":
      return "Self-worth questions show up regularly, especially around performance or relationships.";
    case "connection":
      return "You reflect a lot on relationships—craving closeness yet feeling guarded.";
    case "energy dips":
      return "Energy levels fluctuate and you often describe fatigue or burnout nearing mid-week.";
    case "growth":
      return "You’re tracking your own growth, noting small wins even on heavier days.";
    default:
      return "This theme is still forming—keep writing so I can read it better.";
  }
}

function parseThemes(text: string): JournalTheme[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [themePart, summaryPart = ""] = line.split(":").map((part) => part.trim());
      const freqMatch = summaryPart.match(/(\d+)\s*(entries|times|mentions)/i);
      const frequency = freqMatch ? parseInt(freqMatch[1], 10) : undefined;
      const summary = summaryPart.replace(/(\d+)\s*(entries|times|mentions)/i, "").trim();
      return {
        theme: themePart || "Theme",
        summary: summary || summaryPart || "Vella is still summing this up.",
        frequency: frequency ?? 0,
      };
    })
    .filter((item) => item.theme && item.summary)
    .slice(0, 6);
}

function titleCase(input: string): string {
  return input.replace(/\b\w/g, (char) => char.toUpperCase());
}

