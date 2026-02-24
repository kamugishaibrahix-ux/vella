"use server";

import { serverLocalSet } from "@/lib/local/serverLocal";
import { getPersonalityProfile, type PersonalityProfile } from "./getPersonalityProfile";

type UpdateInput = {
  userMessage: string;
  aiResponse: string;
  distressScore: number;
  style?: { tone?: string; pacing?: string; formality?: string } | null;
};

const STEP = 0.03;

export async function updatePersonalityProfile(userId: string | null, input: UpdateInput) {
  if (!userId) return;

  const current = await getPersonalityProfile(userId);
  const updated = applyAdjustments(current, input);

  try {
    await serverLocalSet(`vella_personality:${userId}`, {
      user_id: userId,
      traits: updated,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[updatePersonalityProfile] error", error);
  }
}

function applyAdjustments(profile: PersonalityProfile, input: UpdateInput): PersonalityProfile {
  const updated = { ...profile };
  const tone = input.style?.tone?.toLowerCase() ?? "";
  const pacing = input.style?.pacing?.toLowerCase() ?? "";
  const formality = input.style?.formality?.toLowerCase() ?? "";
  const distress = input.distressScore ?? 0;
  const userText = input.userMessage.toLowerCase();

  if (distress >= 0.6) {
    updated.warmth = clamp(updated.warmth + STEP);
    updated.empathy = clamp(updated.empathy + STEP);
    updated.humour = clamp(updated.humour - STEP);
  } else if (distress <= 0.2) {
    updated.optimism = clamp(updated.optimism + STEP / 2);
    updated.stoic_clarity = clamp(updated.stoic_clarity - STEP / 2);
  }

  if (tone.includes("direct") || userText.includes("straightforward")) {
    updated.directness = clamp(updated.directness + STEP);
  } else if (tone.includes("soft") || tone.includes("gentle")) {
    updated.warmth = clamp(updated.warmth + STEP);
    updated.directness = clamp(updated.directness - STEP / 2);
  }

  if (formality.includes("formal")) {
    updated.expressiveness = clamp(updated.expressiveness - STEP / 2);
    updated.directness = clamp(updated.directness + STEP / 2);
  } else if (formality.includes("casual")) {
    updated.expressiveness = clamp(updated.expressiveness + STEP / 2);
    updated.humour = clamp(updated.humour + STEP / 2);
  }

  if (pacing.includes("fast")) {
    updated.pacing = "fast";
  } else if (pacing.includes("slow")) {
    updated.pacing = "slow";
  } else if (pacing.includes("medium")) {
    updated.pacing = "medium";
  }

  if (userText.includes("stoic") || userText.includes("logic")) {
    updated.stoic_clarity = clamp(updated.stoic_clarity + STEP / 2);
  }

  if (input.aiResponse.toLowerCase().includes("humour") === false && updated.humour > 0.5) {
    updated.humour = clamp(updated.humour - STEP / 3);
  }

  return updated;
}

function clamp(value: number, delta = 0) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value + delta));
}

