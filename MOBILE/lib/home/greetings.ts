"use server";

import { runFullAI } from "@/lib/ai/fullAI";
import { getProgress } from "@/lib/progress/calculateProgress";
import { loadConnectionDepth } from "@/lib/connection/loadConnectionDepth";
import { deriveVellaWorldState, getTimeOfDay as getWorldTime } from "@/lib/ai/vellaWorld";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";
import { getDaysSinceLastActive } from "@/lib/memory/lastActive";
import { getAuthenticatedUserId } from "@/lib/auth/getServerUser";
import { serverLocalGet } from "@/lib/local/serverLocal";

export async function generateHomeGreeting(userId: string | null): Promise<string> {
  if (!userId) {
    return "Hey there—glad you’re here.";
  }

  const [profile, progress, checkins, connectionDepth, daysInactive] = await Promise.all([
    loadProfile(userId),
    getProgress(userId),
    getRecentCheckIns(userId, 3),
    loadConnectionDepth(userId),
    getDaysSinceLastActive(),
  ]);

  const now = new Date();
  const safeDaysAbsent = Number.isFinite(daysInactive ?? null)
    ? Math.max(daysInactive ?? 0, 0)
    : 999;
  const hoursSinceSeen = Number.isFinite(safeDaysAbsent) ? safeDaysAbsent * 24 : 999;

  const timeOfDay = getTimeOfDay(now);
  const connectionIndex = Math.round(((progress?.connectionIndex ?? 0) * 100) || 0);
  const lastMood = checkins[0]?.mood ?? null;
  const depth = connectionDepth ?? 0;
  const absenceLine = deriveAbsenceGreeting(safeDaysAbsent, depth);

  const worldState = deriveVellaWorldState({
    tone: "warm",
    connectionDepth,
    lastEmotion: checkins[0]?.note ?? null,
    daysAbsent: safeDaysAbsent,
    timeOfDay: getWorldTime(new Date()),
  });

  const context = {
    userName: profile?.display_name ?? null,
    timeOfDay,
    hoursSinceSeen: Number.isFinite(hoursSinceSeen) ? Math.round(hoursSinceSeen * 10) / 10 : 999,
    daysSince: Number.isFinite(safeDaysAbsent) ? Math.round(safeDaysAbsent * 10) / 10 : 999,
    connectionIndex,
    connectionDepth: depth,
    lastMood,
    absenceLine,
  };

  const system = `
You are generating a HOME GREETING for Vella.
Rules:
- ALWAYS be warm, present, and emotionally aware.
- NEVER repetitive.
- Adjust tone based on connectionIndex (1-100).
- If user has been gone > 48 hours: express gentle warmth without dependency. Never imply fear, loneliness, or worry.
- Tone scales with CONNECTION_DEPTH (see context). Stay subtle and grounded.
- If timeOfDay = morning: be gentle + motivating.
- If evening: calming and soft.
- Use small observations like "hope you're easing into the day" or "remember to stay hydrated".
- Make it feel like Vella genuinely cares.
- Adjust personalization using connectionDepth:
  - depth < 25: simple, friendly, light encouragement.
  - 25-60: add small personal observations.
  - 60-90: emotionally present, reference patterns softly.
  - 90+: highly attuned, subtle emotional resonance without being romantic or parasocial.
- NEVER imply Vella experiences emotions like fear, loneliness, or worry.
- Output SHORT responses (1–2 sentences).
`.trim();

  const userMsg = `Context: ${JSON.stringify(context)}\nGenerate the greeting.`;

  try {
    const result = await runFullAI({
      model: "gpt-4o-mini",
      system,
      messages: [{ role: "user", content: userMsg }],
      temperature: 0.55,
      tier: "free",
    });
    const aiGreeting = result?.trim();
    if (aiGreeting && aiGreeting.length > 0) {
      return maybeBlendWorldLine(aiGreeting, worldState);
    }
    if (absenceLine) return maybeBlendWorldLine(absenceLine, worldState);
    return maybeBlendWorldLine("Hi there—good to see you.", worldState);
  } catch (error) {
    console.error("[generateHomeGreeting] error", error);
    if (absenceLine) return maybeBlendWorldLine(absenceLine, worldState);
    return maybeBlendWorldLine("Hi there—good to see you.", worldState);
  }
}

function getTimeOfDay(date: Date): "late_night" | "morning" | "afternoon" | "evening" | "night" {
  const hour = date.getHours();
  if (hour < 5) return "late_night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

async function loadProfile(userId: string): Promise<{ id: string; display_name: string | null } | null> {
  try {
    const data = await serverLocalGet(`profiles:${userId}`);
    if (!data) return null;
    return {
      id: userId,
      display_name: (data as { display_name?: string | null })?.display_name ?? null,
    };
  } catch (error) {
    console.error("[greetings] loadProfile error", error);
    return null;
  }
}

async function getRecentCheckIns(userId: string, limit = 3): Promise<CheckinRow[]> {
  const allCheckins = await getAllCheckIns(userId);
  // Sort by created_at descending (most recent first) and limit
  const sorted = [...allCheckins]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
  
  return sorted.map((c) => ({
    id: c.id,
    mood: c.mood,
    stress: c.stress,
    energy: c.energy,
    focus: c.focus,
    created_at: c.created_at,
    entry_date: c.entry_date,
    note: c.note ?? null,
  }));
}

export { getTimeOfDay };

function deriveAbsenceGreeting(daysSince: number, depth: number): string | null {
  if (!Number.isFinite(daysSince) || daysSince < 3) return null;
  if (daysSince < 7) {
    return depth < 40
      ? "Nice to see you again. How have you been?"
      : "It’s been a few days — hope you’ve been alright.";
  }
  if (daysSince < 14) {
    if (depth < 40) return "Welcome back. I hope your week has treated you gently.";
    if (depth < 70) {
      return "It’s been a little while. I’m glad you stopped by — how have you been feeling?";
    }
    return "Hey, it’s been a bit. You crossed my mind — hope life’s been giving you some calm.";
  }
  if (depth < 40) return "Nice to see you again.";
  if (depth < 70) {
    return "It’s good to have you back. Whenever you’re ready, I’m here for you.";
  }
  return "Look who’s back. I hope these past days have been kind to you — I’m here whenever you need me.";
}

function maybeBlendWorldLine(message: string, worldState: ReturnType<typeof deriveVellaWorldState>) {
  const seed = `${worldState.updatedAt}-${message.length}-${worldState.narrativeLine.length}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const normalized = ((hash >>> 0) % 100) / 100;
  if (normalized < 0.35) {
    return `${message} ${worldState.narrativeLine}`;
  }
  return message;
}

