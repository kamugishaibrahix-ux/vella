"use server";

import type { PlanTier } from "@/lib/tiers/tierCheck";
import { getUserPlanTier } from "@/lib/tiers/server";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";
import { callVellaReflectionAPI } from "@/lib/ai/reflection";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import { generateEmotionalPatterns } from "@/lib/insights/patterns";
import type { MemoryProfile } from "@/lib/memory/types";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";

export type EmotionPrediction = {
  risk: "low" | "medium" | "high";
  type: "anxiety" | "stress" | "energy" | "mood" | null;
  message: string;
};

const SAFE_DEFAULT: EmotionPrediction = {
  risk: "low",
  type: null,
  message: "",
};

export async function predictEmotionState(userId: string | null): Promise<EmotionPrediction> {
  if (!userId) return SAFE_DEFAULT;

  const [planTier, checkins] = await Promise.all([
    getUserPlanTier(userId),
    fetchRecentCheckins(userId),
  ]);

  if (checkins.length === 0) {
    return SAFE_DEFAULT;
  }

  const _ent = getDefaultEntitlements(planTier);
  if (!_ent.enableDeepDive) {
    return heuristicPrediction(checkins);
  }

  const combined = buildPredictionDataset(checkins);
  const personaSettings = await loadServerPersonaSettings(userId);
  const personaLanguage = personaSettings?.language ?? "en";
  const patternSnapshot = await generateEmotionalPatterns(userId, personaLanguage, personaSettings);
  const summary = summarisePatterns(patternSnapshot.patterns);
  const response = await callVellaReflectionAPI({
    type: "prediction",
    content: combined,
    planTier,
    userId,
    emotionalPatternsSummary: summary,
  });

  const parsed = parsePredictionResponse(response.message);
  if (response.type === "ai_response" && parsed) {
    return parsed;
  }

  return heuristicPrediction(checkins);
}

async function fetchRecentCheckins(userId: string): Promise<CheckinRow[]> {
  const allCheckins = await getAllCheckIns(userId);
  // Sort by created_at descending (most recent first) and limit to 30
  const sorted = [...allCheckins]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30);
  
  return sorted.map((c) => ({
    id: c.id,
    mood: c.mood,
    stress: c.stress,
    energy: c.energy ?? 0,
    focus: c.focus,
    entry_date: c.entry_date,
    created_at: c.created_at,
    note: c.note ?? null,
  }));
}

function heuristicPrediction(checkins: CheckinRow[]): EmotionPrediction {
  const sorted = [...checkins].sort(
    (a, b) => new Date(a.created_at ?? a.entry_date ?? "").getTime() - new Date(b.created_at ?? b.entry_date ?? "").getTime(),
  );
  let riskScore = 0;
  let type: EmotionPrediction["type"] = null;
  const signals: string[] = [];

  if (sorted.length >= 5) {
    const lastFive = sorted.slice(-5);
    const firstAvg = average(lastFive.slice(0, 2).map((c) => c.mood ?? 0));
    const recentAvg = average(lastFive.slice(-2).map((c) => c.mood ?? 0));
    if (recentAvg < firstAvg - 0.8) {
      riskScore += 1;
      type = type ?? "mood";
      signals.push("Mood has been sliding over the last few days.");
    }
  }

  const recentStress = average(sorted.slice(-5).map((c) => c.stress ?? 0));
  const earlierStress = average(sorted.slice(-10, -5).map((c) => c.stress ?? 0));
  if (recentStress - earlierStress >= 1.2) {
    riskScore += 1;
    type = type ?? "stress";
    signals.push("Stress readings are creeping upward.");
  }

  const eveningTension = sorted.filter((entry) => {
    const hours = new Date(entry.created_at ?? entry.entry_date ?? "").getHours();
    const note = entry.note?.toLowerCase() ?? "";
    return hours >= 18 && /anxious|worried|uneasy|tense/.test(note);
  });
  if (eveningTension.length >= 2) {
    riskScore += 1;
    type = type ?? "anxiety";
    signals.push("Evening notes often mention feeling tense.");
  }

  const lowEnergy = sorted.slice(-7).filter((c) => (c.energy ?? 0) <= 4);
  if (lowEnergy.length >= 4) {
    riskScore += 1;
    type = type ?? "energy";
    signals.push("Energy has stayed low across several entries.");
  }

  const risk = riskScore >= 2 ? "high" : riskScore === 1 ? "medium" : "low";
  const message =
    risk === "low"
      ? ""
      : signals[0] ??
        "It looks like your emotional rhythm is a bit fragile lately. Let’s pace today gently.";

  return {
    risk,
    type,
    message,
  };
}

function buildPredictionDataset(checkins: CheckinRow[]): string {
  return checkins
    .slice(0, 20)
    .map((entry) => {
      const date = entry.entry_date ?? entry.created_at ?? "";
      const mood = entry.mood ?? "n/a";
      const stress = entry.stress ?? "n/a";
      const energy = entry.energy ?? "n/a";
      const focus = entry.focus ?? "n/a";
      const note = entry.note ? `Note: ${entry.note}` : "";
      return `${date}: mood ${mood}/10, stress ${stress}/10, energy ${energy}/10, focus ${focus}/10. ${note}`;
    })
    .join("\n");
}

function parsePredictionResponse(text: string | undefined): EmotionPrediction | null {
  if (!text) return null;
  const riskMatch = text.match(/risk:\s*(low|medium|high)/i);
  const typeMatch = text.match(/type:\s*(anxiety|stress|energy|mood)/i);
  const messageMatch = text.match(/message:\s*([\s\S]+)/i);

  const risk = (riskMatch?.[1].toLowerCase() as EmotionPrediction["risk"]) ?? "medium";
  const type = (typeMatch?.[1].toLowerCase() as EmotionPrediction["type"]) ?? null;
  const message = messageMatch?.[1]?.trim() ?? text.trim();

  return {
    risk,
    type,
    message,
  };
}

function summarisePatterns(patterns: MemoryProfile["emotionalPatterns"]) {
  const lines: string[] = [];
  if (patterns.commonPrimaryEmotions.length) {
    lines.push(`Primary emotions: ${patterns.commonPrimaryEmotions.join(", ")}`);
  }
  if (patterns.commonTriggers.length) {
    lines.push(`Triggers: ${patterns.commonTriggers.join(", ")}`);
  }
  if (patterns.commonFears.length) {
    lines.push(`Fears: ${patterns.commonFears.join(", ")}`);
  }
  if (patterns.emotionalTendencies.length) {
    lines.push(`Tendencies: ${patterns.emotionalTendencies.join(", ")}`);
  }
  return lines.join("; ");
}

function average(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

