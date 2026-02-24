"use server";

import { listJournalEntries } from "@/lib/journal/server";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";
import { loadProgress } from "./loadProgress";
import { saveProgress } from "./saveProgress";
import type { ConnectionProgress, ConnectionProgressWithMeta } from "./types";

type PreviousStats = ConnectionProgress | null;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function calculateProgress(
  userId: string,
  previous: PreviousStats,
): Promise<ConnectionProgress> {
  const [checkins, journals] = await Promise.all([getAllCheckIns(userId), listJournalEntries(userId, 100)]);

  const now = Date.now();
  const recentCheckins = checkins.filter((row) => isWithinDays(row.entry_date ?? row.created_at, now, 14));
  const recentJournals = journals.filter((row) => isWithinDays(row.createdAt, now, 14));

  const consistencyScore = clamp(
    (recentCheckins.length / 12) * 0.7 + (recentJournals.length / 6) * 0.3,
  );
  const emotionalOpenness = clamp(
    computeAverageLength(recentJournals.map((j) => j.content ?? "")) / 220 +
      computeAverageLength(recentCheckins.map((c) => c.note ?? "")) / 180,
  );
  const improvementScore = computeImprovementScore(checkins);
  const stabilityScore = computeStabilityScore(recentCheckins);

  let connectionIndex =
    consistencyScore * 0.35 +
    emotionalOpenness * 0.25 +
    improvementScore * 0.2 +
    stabilityScore * 0.2;

  if (previous) {
    connectionIndex = limitDailyChange(previous.connectionIndex, connectionIndex);
  }

  return {
    consistencyScore,
    emotionalOpenness,
    improvementScore,
    stabilityScore,
    connectionIndex: clamp(connectionIndex),
  };
}

function computeImprovementScore(checkins: { mood: number | null; created_at: string | null }[]): number {
  if (checkins.length < 6) return 0.5;
  const sorted = [...checkins].sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
  const recent = sorted.slice(-7);
  const previous = sorted.slice(-14, -7);
  const recentAvg = average(recent.map((c) => c.mood ?? 5));
  const prevAvg = average(previous.map((c) => c.mood ?? recentAvg));
  const diff = recentAvg - prevAvg;
  return clamp(0.5 + diff / 8);
}

function computeStabilityScore(checkins: { stress: number | null }[]): number {
  if (checkins.length < 4) return 0.6;
  const stresses = checkins.map((c) => (c.stress ?? 5) / 10);
  const variance = stresses.reduce((acc, value) => acc + Math.pow(value - average(stresses), 2), 0) /
    stresses.length;
  return clamp(1 - variance);
}

function computeAverageLength(items: string[]): number {
  if (!items.length) return 0;
  const total = items.reduce((sum, text) => sum + text.trim().split(/\s+/).length, 0);
  return total / items.length;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function isWithinDays(dateString: string | null, now: number, days: number): boolean {
  if (!dateString) return false;
  const timestamp = Date.parse(dateString);
  if (Number.isNaN(timestamp)) return false;
  return now - timestamp <= days * DAY_MS;
}

function limitDailyChange(previous: number, current: number): number {
  if (previous <= 0) return current;
  const maxIncrease = previous * 1.007;
  const maxDecrease = previous * (1 - 0.012);
  return clamp(current, Math.max(0, maxDecrease), Math.min(1, maxIncrease));
}

export async function updateProgress(
  userId: string | null,
  extraData?: Record<string, unknown>,
): Promise<ConnectionProgress | null> {
  if (!userId) return null;
  const previous = await loadProgress(userId);
  const previousMetrics: ConnectionProgress | null = previous
    ? {
        consistencyScore: previous.consistencyScore,
        emotionalOpenness: previous.emotionalOpenness,
        improvementScore: previous.improvementScore,
        stabilityScore: previous.stabilityScore,
        connectionIndex: previous.connectionIndex,
      }
    : null;
  const metrics = await calculateProgress(userId, previousMetrics);
  await saveProgress(userId, metrics, extraData);
  return metrics;
}

export async function getProgress(
  userId: string | null,
): Promise<ConnectionProgressWithMeta> {
  return loadProgress(userId);
}

