"use server";

import { serverLocalGet, serverLocalSet } from "@/lib/local/serverLocal";
import { updateProgress } from "./updateProgress";

type AchievementKey =
  | "journal_streak_3"
  | "journal_streak_7"
  | "checkin_streak_5"
  | "mood_improving"
  | "confidence_growth"
  | "loop_breakthrough"
  | "mental_clarity";

type Achievement = {
  user_id: string;
  key: AchievementKey;
  earned_at: string;
};

const ACHIEVEMENTS_KEY = (userId: string) => `achievements:${userId}`;

export async function earnAchievement(userId: string, key: AchievementKey) {
  try {
    const achievements = (await serverLocalGet(ACHIEVEMENTS_KEY(userId)) ?? []) as Achievement[];
    const existing = achievements.find((a) => a.user_id === userId && a.key === key);
    if (!existing) {
      achievements.push({
        user_id: userId,
        key,
        earned_at: new Date().toISOString(),
      });
      await serverLocalSet(ACHIEVEMENTS_KEY(userId), achievements);
    }
  } catch (error) {
    console.error("[earnAchievement] error", error);
  }
}

export async function checkAchievements(userId: string | null) {
  if (!userId) return;
  const progress = await updateProgress(userId);
  if (!progress) return;

  if (progress.journalStreak >= 7) {
    await earnAchievement(userId, "journal_streak_7");
  } else if (progress.journalStreak >= 3) {
    await earnAchievement(userId, "journal_streak_3");
  }

  if (progress.checkInStreak >= 5) {
    await earnAchievement(userId, "checkin_streak_5");
  }

  if (progress.moodTrend === "improving") {
    await earnAchievement(userId, "mood_improving");
  }

  const progressData = progress as any;
  if (progressData?.traitsDelta?.confidence > 0.2) {
    await earnAchievement(userId, "confidence_growth");
  }

  if (progressData?.loopsDelta === "down") {
    await earnAchievement(userId, "loop_breakthrough");
  }

  if (progressData?.distortionsDelta === "down") {
    await earnAchievement(userId, "mental_clarity");
  }

    try {
    await serverLocalSet(`progress_metrics:${userId}`, {
      ...progress,
      traitsDelta: progressData?.traitsDelta ?? null,
    });
    } catch (error) {
      console.warn("[progress] checkAchievements error", error);
  }
}

