"use server";

import { generateEmotionalPatterns } from "./patterns";
import { analyseJournalEntries } from "./journalAnalysis";
import { getSummary } from "@/lib/memory/conversation";
import { getUserPlanTier } from "@/lib/tiers/server";
import { callVellaReflectionAPI } from "@/lib/ai/reflection";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import type { LocalJournalEntry } from "@/lib/local/journalLocal";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";

type JournalRow = LocalJournalEntry;

export type LifeTheme = {
  theme: string;
  description: string;
};

const LIFE_THEME_ERROR = "Life themes fetch failed";

export async function extractLifeThemes(userId: string): Promise<LifeTheme[]> {
  if (!userId) {
    throw new Error(LIFE_THEME_ERROR);
  }

  const initialCheckins = await getAllCheckIns(userId);
  if (!initialCheckins || initialCheckins.length === 0) {
    return [];
  }

  const [planTier, checkins, journals, journalThemes, convoSummary, personaSettings] =
    await Promise.all([
      getUserPlanTier(userId),
      fetchCheckins(userId),
      fetchJournals(userId),
      analyseJournalEntries(userId),
      getSummary(userId),
      loadServerPersonaSettings(userId),
    ]);

  const _ent = getDefaultEntitlements(planTier);
  if (!_ent.enableDeepDive) {
    return buildLiteThemes(checkins, journals, journalThemes);
  }

  const patternSnapshot = await generateEmotionalPatterns(
    userId,
    personaSettings?.language ?? "en",
    personaSettings,
  );

  const payload = {
    type: "life_themes" as const,
    data: {
      checkins: checkins.slice(0, 50),
      journals: journals.slice(0, 20),
      patterns: patternSnapshot.patterns,
      journalThemes,
      conversationSummary: convoSummary,
    },
    planTier,
    userId,
  };

  const response = await callVellaReflectionAPI(payload);

  if (response.type === "ai_response") {
    const parsed = parseLifeThemes(response.message);
    if (parsed.length > 0) return parsed;
  }

  throw new Error(LIFE_THEME_ERROR);
}

import { listLocalJournals } from "@/lib/local/journalLocal";

async function fetchCheckins(userId: string): Promise<CheckinRow[]> {
  try {
    const allCheckins = await getAllCheckIns(userId);
    // PHASE 11: Filter out entries with invalid dates before sorting
    const validCheckins = allCheckins.filter((c) => {
      if (!c.created_at) return false;
      const date = new Date(c.created_at);
      return !isNaN(date.getTime());
    });
    
    // Sort by created_at descending (most recent first) and limit to 50
    const sorted = [...validCheckins]
      .sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      })
      .slice(0, 50);
    
    return sorted.map((c) => ({
      id: c.id,
      mood: typeof c.mood === 'number' && !isNaN(c.mood) ? c.mood : 0,
      stress: typeof c.stress === 'number' && !isNaN(c.stress) ? c.stress : 0,
      energy: typeof c.energy === 'number' && !isNaN(c.energy) ? (c.energy ?? 0) : 0,
      focus: typeof c.focus === 'number' && !isNaN(c.focus) ? c.focus : 0,
      entry_date: c.entry_date,
      created_at: c.created_at,
      note: c.note ?? null,
    })) as CheckinRow[];
  } catch (error) {
    // silent fallback
    return [];
  }
}

async function fetchJournals(userId: string): Promise<JournalRow[]> {
  try {
    const journals = listLocalJournals(userId);
    // PHASE 11: Filter out corrupt journal entries
    const validJournals = journals.filter((j) => {
      if (!j.id || typeof j.id !== 'string') return false;
      if (!j.content || typeof j.content !== 'string') return false;
      return true;
    });
    return validJournals.slice(0, 20);
  } catch (error) {
    // silent fallback
    return [];
  }
}

function buildLiteThemes(
  checkins: CheckinRow[],
  journals: JournalRow[],
  journalThemes: { theme: string; summary: string; frequency: number }[],
): LifeTheme[] {
  const textBlob = [
    checkins.map((c) => c.note ?? "").join(" "),
    journals.map((j) => j.content ?? "").join(" "),
    journalThemes.map((t) => `${t.theme} ${t.summary}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  const summaryKeywords = journalThemes.map((t) => t.theme.toLowerCase());

  const heuristics = [
    {
      theme: "Identity & self-worth",
      description:
        "You often circle back to questions of value, belonging, and what it means to be enough.",
      keywords: ["identity", "worth", "belong", "enough", "confidence"],
      boost: summaryKeywords.filter((keyword) => keyword.includes("identity")).length,
    },
    {
      theme: "Emotional regulation",
      description:
        "You’re actively learning how to ride emotional waves, especially anxiety or stress surges.",
      keywords: ["anxiety", "panic", "regulat", "cope", "overwhelm", "stress"],
      boost: checkins.filter((c) => (c.stress ?? 0) >= 7).length >= 3 ? 1 : 0,
    },
    {
      theme: "Connection & attachment",
      description:
        "Relationships matter deeply; you oscillate between craving closeness and protecting your heart.",
      keywords: ["relationship", "attachment", "partner", "friend", "alone", "connection"],
      boost: summaryKeywords.filter((keyword) => keyword.includes("relationship")).length,
    },
    {
      theme: "Purpose & direction",
      description:
        "There’s a running thread about purpose—decisions, career pivots, and aligning life to your values.",
      keywords: ["purpose", "career", "direction", "goal", "path", "mission"],
      boost: journals.filter((j) => (j.title ?? "").toLowerCase().includes("plan")).length ? 1 : 0,
    },
    {
      theme: "Energy & capacity",
      description:
        "Energy management is a theme—protecting bandwidth, noticing fatigue, and pacing yourself.",
      keywords: ["tired", "fatigue", "burnout", "exhausted", "rest", "sleep"],
      boost: checkins.filter((c) => (c.energy ?? 0) <= 3).length >= 2 ? 1 : 0,
    },
  ];

  const scored = heuristics
    .map(({ theme, description, keywords, boost }) => {
      const weight =
        keywords.reduce((score, keyword) => score + (textBlob.includes(keyword) ? 1 : 0), 0) + boost;
      return { theme, description, weight };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);

  if (scored.length === 0) {
    return [
      {
        theme: "Keep journaling",
        description:
          "With a few more entries, I'll be able to show you the big emotional patterns shaping your story.",
      },
    ];
  }

  return scored.map(({ theme, description }) => ({
    theme,
    description,
  }));
}

export async function getLifeThemes(userId: string): Promise<LifeTheme[]> {
  return extractLifeThemes(userId);
}

function parseLifeThemes(text: string | undefined): LifeTheme[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): LifeTheme | null => {
      const [theme, description] = line.split(":").map((part) => part.trim());
      if (!theme || !description) return null;
      return { theme, description };
    })
    .filter((item): item is LifeTheme => Boolean(item))
    .slice(0, 5);
}

