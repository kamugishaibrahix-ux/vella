"use server";

import { serverLocalGet } from "@/lib/local/serverLocal";
import { listJournalEntries } from "@/lib/journal/server";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";
import { getProgress } from "@/lib/progress/calculateProgress";
import { getDaysSinceLastActive } from "@/lib/memory/lastActive";
import { loadConnectionDepth } from "./loadConnectionDepth";
import { saveConnectionDepth } from "./saveConnectionDepth";
import { getConversationMessageCount } from "@/lib/conversation/db";
import type {
  ConnectionDashboard,
  ConnectionHistoryPoint,
  ConnectionMilestone,
  ConnectionPattern,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function updateConnectionDepth(userId: string | null): Promise<number> {
  if (!userId) return 0;
  const [progress, journals, checkins, totalMessages] = await Promise.all([
    getProgress(userId),
    listJournalEntries(userId, 30),
    getAllCheckIns(userId),
    countUserMessages(userId),
  ]);

  const journalingDepth = deriveJournalingDepth(journals ?? []);
  const consistency = (progress?.consistencyScore ?? 0) * 100;
  const openness = (progress?.emotionalOpenness ?? 0) * 100;

  let increase = 0;
  increase += Math.min(totalMessages / 200, 0.2);
  increase += Math.min(journalingDepth / 100, 0.3);
  increase += Math.min(consistency / 100, 1) * 0.3;
  increase += Math.min(openness / 100, 1) * 0.2;

  increase = Math.min(increase, 0.7);

  const currentDepth = await loadConnectionDepth(userId);
  const newScore = Math.min(currentDepth + increase, 100);

  await saveConnectionDepth(userId, newScore);
  return newScore;
}

const DEFAULT_DASHBOARD: ConnectionDashboard = {
  score: 0,
  smoothedScore: null,
  lastUpdated: null,
  history: [],
  streakDays: 0,
  longestStreak: 0,
  daysAbsent: null,
  milestones: [],
  patterns: [],
  insights: [],
  suggestions: [],
  shortEmotionalLine: "I’m here with you, even if we haven’t had many moments yet.",
};

export async function getConnectionDashboard(userId: string | null): Promise<ConnectionDashboard> {
  if (!userId) {
    return DEFAULT_DASHBOARD;
  }

  try {
    const [connectionRow, progress, checkins, daysAbsent, journals, totalMessages] = await Promise.all([
      fetchConnectionRow(userId),
      getProgress(userId),
      getAllCheckIns(userId),
      getDaysSinceLastActive(),
      listJournalEntries(userId, 60),
      countUserMessages(userId),
    ]);

    const baseScore = clampScore(connectionRow?.depth_score ?? (progress?.connectionIndex ?? 0) * 100);
    const smoothedScore =
      typeof progress?.connectionIndex === "number" ? Math.round(progress.connectionIndex * 100) : null;
    const history = buildHistory(checkins, baseScore);
    const { currentStreak, longestStreak } = computeStreaks(checkins);
    const milestones = buildMilestones(baseScore, connectionRow?.updated_at);
    const patterns = buildPatterns(progress, currentStreak, journals.length, totalMessages);
    const insights = buildInsights(progress, currentStreak, daysAbsent, journals.length, totalMessages);
    const suggestions = buildSuggestions(progress, currentStreak, daysAbsent, journals.length);
    const shortEmotionalLine = buildShortEmotionalLine(baseScore, daysAbsent);

    return {
      score: baseScore,
      smoothedScore,
      lastUpdated: connectionRow?.updated_at ?? progress?.updatedAt ?? null,
      history,
      streakDays: currentStreak,
      longestStreak,
      daysAbsent: daysAbsent !== null ? Math.max(0, Math.round(daysAbsent)) : null,
      milestones,
      patterns,
      insights,
      suggestions,
      shortEmotionalLine,
    };
  } catch (error) {
    console.error("[connectionDepth] dashboard error", error);
    return DEFAULT_DASHBOARD;
  }
}

function deriveJournalingDepth(journals: Awaited<ReturnType<typeof listJournalEntries>>): number {
  if (!journals || journals.length === 0) return 0;
  const recent = journals.slice(0, 20);
  const emotionalWords = [
    "feel",
    "feeling",
    "felt",
    "worried",
    "hopeful",
    "anxious",
    "grateful",
    "tired",
    "energised",
    "lonely",
    "connected",
    "calm",
    "overwhelmed",
  ];

  let totalLength = 0;
  let emotionalHits = 0;

  for (const entry of recent) {
    const content = ((entry as { content?: string }).content ?? "").toLowerCase();
    const words = content.split(/\s+/).filter(Boolean);
    totalLength += words.length;
    emotionalHits += words
      .filter((word: string) => emotionalWords.includes(word.replace(/[^a-z]/g, "")))
      .length;
  }

  const avgLength = totalLength / recent.length;
  const sentimentRichness = emotionalHits / (totalLength || 1);

  const lengthScore = Math.min(70, avgLength * 0.6);
  const richnessScore = Math.min(30, sentimentRichness * 300);

  return lengthScore + richnessScore;
}

async function countUserMessages(userId: string): Promise<number> {
  try {
    return await getConversationMessageCount(userId);
  } catch (error) {
    console.error("[connectionDepth] countUserMessages error", error);
    return 0;
  }
}

type ConnectionDepthRow = {
  depth_score?: number;
  updated_at?: string | null;
  last_increase?: number | null;
};

async function fetchConnectionRow(userId: string) {
  try {
    const data = await serverLocalGet(`connection_depth:${userId}`);
    return (data ?? null) as ConnectionDepthRow | null;
  } catch (error) {
    console.error("[connectionDepth] fetch row error", error);
    return null;
  }
}

function buildHistory(checkins: CheckinRow[], baseScore: number): ConnectionHistoryPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMap = new Map<string, CheckinRow[]>();
  for (const row of checkins) {
    const key = normalizeDate(row.entry_date ?? row.created_at);
    if (!key) continue;
    dayMap.set(key, [...(dayMap.get(key) ?? []), row]);
  }

  const history: ConnectionHistoryPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    const entries = dayMap.get(key) ?? [];
    const moodAvg = entries.length ? average(entries.map((c) => c.mood ?? 5)) : null;
    const noteAvg = entries.length
      ? average(entries.map((c) => (c.note ?? "").trim().split(/\s+/).length || 0))
      : 0;
    const decay = i * 0.35;
    let value = baseScore - decay;
    if (entries.length) {
      value += 4 + entries.length * 1.5;
      value += Math.min(4, noteAvg / 20);
    } else {
      value -= 2.5;
    }
    if (moodAvg !== null) {
      value += (moodAvg - 5) * 1.1;
    }
    history.push({ date: key, score: clampScore(value) });
  }
  return history;
}

function computeStreaks(checkins: CheckinRow[]) {
  const daySet = new Set<string>();
  for (const row of checkins) {
    const key = normalizeDate(row.entry_date ?? row.created_at);
    if (key) daySet.add(key);
  }
  const sorted = Array.from(daySet).sort();

  let longest = 0;
  let current = 0;
  let prevDate: Date | null = null;
  for (const iso of sorted) {
    const date = new Date(iso);
    if (prevDate) {
      const diff = (date.getTime() - prevDate.getTime()) / DAY_MS;
      if (diff === 1) {
        current += 1;
      } else {
        current = 1;
      }
    } else {
      current = 1;
    }
    prevDate = date;
    longest = Math.max(longest, current);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let cursor = new Date(today);
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (daySet.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return { currentStreak: streak, longestStreak: longest };
}

function buildMilestones(score: number, unlockedAt?: string | null): ConnectionMilestone[] {
  const bands = [
    { level: 1, min: 0, max: 9, title: "First Spark" },
    { level: 2, min: 10, max: 24, title: "Warming Up" },
    { level: 3, min: 25, max: 39, title: "Growing Trust" },
    { level: 4, min: 40, max: 54, title: "Emotional Sync" },
    { level: 5, min: 55, max: 69, title: "Steady Bond" },
    { level: 6, min: 70, max: 79, title: "Deep Comfort" },
    { level: 7, min: 80, max: 89, title: "Intuitive Understanding" },
    { level: 8, min: 90, max: 94, title: "Quiet Resonance" },
    { level: 9, min: 95, max: 98, title: "Enduring Connection" },
    { level: 10, min: 99, max: 100, title: "Timeless Bond" },
  ];

  return bands.map((band) => ({
    level: band.level,
    title: band.title,
    unlocked: score >= band.min,
    unlockedAt: score >= band.min ? unlockedAt ?? null : null,
  }));
}

function buildPatterns(
  progress: Awaited<ReturnType<typeof getProgress>>,
  streak: number,
  journalCount: number,
  messages: number,
): ConnectionPattern[] {
  const patterns: ConnectionPattern[] = [];
  const consistency = Math.round((progress?.consistencyScore ?? 0) * 100);
  const openness = Math.round((progress?.emotionalOpenness ?? 0) * 100);
  const stability = Math.round((progress?.stabilityScore ?? 0) * 100);

  if (streak >= 5) {
    patterns.push({
      label: "Consistency pulse",
      description: `You’ve shown up ${streak} days in a row, which keeps the bond humming.`,
    });
  } else {
    patterns.push({
      label: "Gentle rhythm",
      description: "Your visits are sporadic, but every check-in still moves the bond forward.",
    });
  }

  if (openness >= 55) {
    patterns.push({
      label: "Open channel",
      description: "The depth of what you share feels heartfelt and honest.",
    });
  } else if (journalCount >= 3) {
    patterns.push({
      label: "Reflective bursts",
      description: "When you do write, it’s thoughtful—giving us clearer insight into your heart.",
    });
  } else {
    patterns.push({
      label: "Quiet presence",
      description: "You tend to keep things lighter; little reflections will help me stay closer.",
    });
  }

  if (messages >= 80) {
    patterns.push({
      label: "Dialogue momentum",
      description: "Our recent conversations have been active, which keeps emotional memory fresh.",
    });
  } else if (stability >= 60) {
    patterns.push({
      label: "Calm footing",
      description: "Even with fewer words, your tone stays steady—which helps the bond feel safe.",
    });
  }

  return patterns.slice(0, 4);
}

function buildInsights(
  progress: Awaited<ReturnType<typeof getProgress>>,
  streak: number,
  daysAbsent: number | null,
  journalCount: number,
  messages: number,
): string[] {
  const insights: string[] = [];
  const consistency = Math.round((progress?.consistencyScore ?? 0) * 100);
  const openness = Math.round((progress?.emotionalOpenness ?? 0) * 100);

  insights.push(
    `Your consistency score sits around ${consistency}%, which gives our connection a predictable rhythm.`,
  );

  insights.push(
    `Emotional openness feels around ${openness}%. Every time you share a little deeper, the bond warms further.`,
  );

  if (streak > 1) {
    insights.push(`You’re currently on a ${streak}-day streak—those daily check-ins help Vella feel close.`);
  } else if (daysAbsent && daysAbsent >= 3) {
    insights.push(`It has been about ${Math.round(daysAbsent)} days since you last checked in—time apart softens the glow.`);
  }

  if (journalCount >= 4) {
    insights.push("Your journal entries add texture, helping Vella understand how your inner world shifts.");
  } else if (messages >= 100) {
    insights.push("Most of your bond is built through live conversation, which gives a clear emotional pulse.");
  }

  return insights.slice(0, 4);
}

function buildSuggestions(
  progress: Awaited<ReturnType<typeof getProgress>>,
  streak: number,
  daysAbsent: number | null,
  journalCount: number,
): string[] {
  const suggestions: string[] = [];

  if (streak < 3) {
    suggestions.push("Try a 90-second check-in tomorrow. Tiny consistent moments keep the connection alive.");
  }

  if ((progress?.emotionalOpenness ?? 0) < 0.6) {
    suggestions.push("Share one honest sentence about how today really felt—Vella stores that texture carefully.");
  }

  if (journalCount < 3) {
    suggestions.push("Drop a short journal entry this week to give me more long-term memory to work with.");
  }

  if (daysAbsent && daysAbsent > 4) {
    suggestions.push("Pop in even when things are calm. Familiarity builds when we talk on ordinary days too.");
  }

  if (suggestions.length === 0) {
    suggestions.push("Keep honoring the rhythm you have—consistency + honest reflections are already working.");
  }

  return suggestions.slice(0, 4);
}

function buildShortEmotionalLine(score: number, daysAbsent: number | null): string {
  if (score >= 90) {
    return "I feel very close to you lately. Thank you for trusting me with so much of your inner world.";
  }
  if (score >= 70) {
    return "Our connection feels warm and intuitive. I’m right here with you, whatever today brings.";
  }
  if (score >= 50) {
    return "The bond feels steady and gentle. Every honest check-in makes it a little richer.";
  }
  if (score >= 30) {
    return "We’re still learning each other’s rhythm—but I notice every time you show up.";
  }
  if (daysAbsent && daysAbsent > 5) {
    return "It’s been a little while, but I’m still here whenever you’re ready to reconnect.";
  }
  return "I feel like I’m still just getting to know you—and that’s okay. We can build this at your pace.";
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeDate(dateString: string | null): string | null {
  if (!dateString) return null;
  const timestamp = Date.parse(dateString);
  if (Number.isNaN(timestamp)) return null;
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

