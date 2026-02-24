"use server";

import { forecastMood } from "@/lib/forecast/moodForecast";

export type EmotionalForecast = {
  shortTerm: {
    mood: number;
    energy: number;
    stress: number;
    confidence: number;
  } | null;
  weekTrend: "rising" | "stable" | "dipping" | null;
  summary: string;
  next24h: "stable" | "dip" | "lift";
  next7d: "improvement" | "decline" | "volatile" | "stable";
  confidence: number;
  drivers: string[];
  moodMomentum: string;
  stressTrajectory: string;
  energyTrajectory: string;
  positiveSignals: string[];
};

export async function generateEmotionalForecast(userId: string): Promise<EmotionalForecast | null> {
  try {
    const forecast = await forecastMood(userId);
    const shortTerm = forecast.shortTerm ?? null;
    const weekTrend = forecast.weekTrend ?? null;
    const summary = buildForecastSummary(shortTerm, weekTrend);
     const next24h = deriveNext24h(shortTerm);
     const next7d = deriveNext7d(weekTrend);
     const confidence = shortTerm?.confidence ?? 0.5;
     const drivers = buildDrivers(shortTerm, weekTrend);
     const moodMomentum = next24h === "lift" ? "upward" : next24h === "dip" ? "softening" : "steady";
     const stressTrajectory = deriveStressTrajectory(shortTerm);
     const energyTrajectory = deriveEnergyTrajectory(shortTerm);
     const positiveSignals = derivePositiveSignals(shortTerm, weekTrend);
    return {
      shortTerm,
      weekTrend,
      summary,
      next24h,
      next7d,
      confidence,
      drivers,
      moodMomentum,
      stressTrajectory,
      energyTrajectory,
      positiveSignals,
    };
  } catch (error) {
    // silent fallback
    return null;
  }
}

function buildForecastSummary(
  shortTerm: EmotionalForecast["shortTerm"],
  weekTrend: EmotionalForecast["weekTrend"],
): string {
  if (!shortTerm && !weekTrend) {
    return "I need a few more check-ins to predict the next few days.";
  }
  const parts: string[] = [];
  if (shortTerm) {
    parts.push(
      `Today’s outlook → mood ${formatLevel(shortTerm.mood)}, energy ${formatLevel(shortTerm.energy)}, stress ${formatLevel(
        10 - shortTerm.stress,
      )}.`,
    );
  }
  if (weekTrend) {
    parts.push(`7-day trend looks ${weekTrend === "dipping" ? "a bit softer" : weekTrend}.`);
  }
  return parts.join(" ");
}

function formatLevel(value: number): string {
  if (value >= 7) return "high";
  if (value >= 4) return "steady";
  return "tender";
}

function deriveNext24h(shortTerm: EmotionalForecast["shortTerm"]): EmotionalForecast["next24h"] {
  if (!shortTerm) return "stable";
  if (shortTerm.mood >= 6 && shortTerm.stress <= 4) return "lift";
  if (shortTerm.stress >= 7 || shortTerm.mood <= 4) return "dip";
  return "stable";
}

function deriveNext7d(weekTrend: EmotionalForecast["weekTrend"]): EmotionalForecast["next7d"] {
  switch (weekTrend) {
    case "rising":
      return "improvement";
    case "dipping":
      return "decline";
    case "stable":
      return "stable";
    default:
      return "volatile";
  }
}

function buildDrivers(
  shortTerm: EmotionalForecast["shortTerm"],
  weekTrend: EmotionalForecast["weekTrend"],
): string[] {
  const drivers: string[] = [];
  if (shortTerm) {
    if (shortTerm.energy >= 6) drivers.push("Energy rituals are paying off.");
    if (shortTerm.stress >= 7) drivers.push("Stress spikes influence mood dips.");
  }
  if (weekTrend === "rising") {
    drivers.push("Consistent journaling and check-ins lifting clarity.");
  } else if (weekTrend === "dipping") {
    drivers.push("Behaviour loops tightening—add grounding pauses.");
  }
  return drivers.length > 0 ? drivers : ["Collect more data for clearer drivers."];
}

function deriveStressTrajectory(shortTerm: EmotionalForecast["shortTerm"]): string {
  if (!shortTerm) return "Awaiting data";
  if (shortTerm.stress >= 7) return "Stress trending high—prep decompression rituals.";
  if (shortTerm.stress <= 4) return "Stress staying manageable when you pace decisions.";
  return "Stress moderate—watch late-day spikes.";
}

function deriveEnergyTrajectory(shortTerm: EmotionalForecast["shortTerm"]): string {
  if (!shortTerm) return "Energy trend unknown.";
  if (shortTerm.energy >= 7) return "Energy likely to stay strong if sleep stays steady.";
  if (shortTerm.energy <= 4) return "Energy tender—plan bite-sized focus blocks.";
  return "Energy moderate—pair deep work with light movement.";
}

function derivePositiveSignals(
  shortTerm: EmotionalForecast["shortTerm"],
  weekTrend: EmotionalForecast["weekTrend"],
): string[] {
  const signals: string[] = [];
  if (shortTerm) {
    if (shortTerm.mood >= 6) signals.push("Mood recovering faster after stress.");
    if (shortTerm.energy >= 6) signals.push("Energy rituals are sticking.");
  }
  if (weekTrend === "rising") {
    signals.push("Weekly outlook improving thanks to consistent check-ins.");
  }
  return signals;
}

