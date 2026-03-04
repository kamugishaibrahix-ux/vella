"use server";

// TODO[privacy]: This module still reads Supabase journal/checkin content.
// Once the local-only insight engine is wired, switch the data source
// to lib/local/localJournals and lib/local/localCheckins.

import { getUserPlanTier } from "@/lib/tiers/server";
import type { PlanTier } from "@/lib/tiers/tierCheck";
import { callVellaReflectionAPI } from "@/lib/ai/reflection";
import { generateEmotionalPatterns } from "./patterns";
import { detectBehaviourLoops } from "./behaviourLoops";
import { getRecentMessages } from "@/lib/memory/conversation";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import type { LocalJournalEntry } from "@/lib/local/journalLocal";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";

type JournalRow = LocalJournalEntry;
type ConversationMessage = Awaited<ReturnType<typeof getRecentMessages>>[number];

export type CognitiveDistortion = {
  type: string;
  explanation: string;
  examples: string[];
  fallback?: boolean;
};

export async function detectCognitiveDistortions(userId: string | null): Promise<CognitiveDistortion[]> {
  if (!userId) return [];

  const [planTier, journals, conversation, loops, personaSettings] = await Promise.all([
    getUserPlanTier(userId),
    fetchJournals(userId),
    getRecentMessages(userId, 20),
    detectBehaviourLoops(userId),
    loadServerPersonaSettings(userId),
  ]);

  const _ent = getDefaultEntitlements(planTier);
  if (!_ent.enableDeepDive) {
    return heuristicDistortions(journals, conversation);
  }

  const patternSnapshot = await generateEmotionalPatterns(
    userId,
    personaSettings?.language ?? "en",
    personaSettings,
  );

  const payload = {
    type: "cognitive_distortions" as const,
    data: {
      journals: journals.slice(0, 15),
      conversation: conversation.slice(0, 20),
      patterns: patternSnapshot.patterns,
      behaviourLoops: loops,
    },
    planTier,
    userId,
  };

  const response = await callVellaReflectionAPI(payload);
  if (response.type === "ai_response") {
    const parsed = parseDistortions(response.message);
    if (parsed.length > 0) return parsed;
  }

  return heuristicDistortions(journals, conversation);
}

import { listLocalJournals } from "@/lib/local/journalLocal";

async function fetchJournals(userId: string): Promise<JournalRow[]> {
  try {
    const journals = listLocalJournals(userId);
    // PHASE 11: Filter out corrupt journal entries
    const validJournals = journals.filter((j) => {
      if (!j.id || typeof j.id !== 'string') return false;
      if (!j.content || typeof j.content !== 'string') return false;
      return true;
    });
    return validJournals.slice(0, 15);
  } catch (error) {
    // silent fallback
    return [];
  }
}

function heuristicDistortions(
  journals: JournalRow[],
  conversation: ConversationMessage[],
): CognitiveDistortion[] {
  const texts = [...journals.map((j) => j.content ?? ""), ...conversation.map((m) => m.content ?? "")];
  const combined = texts.join(" ").toLowerCase();
  const distortions: CognitiveDistortion[] = [];

  if (/(always|never|every time)/.test(combined)) {
    distortions.push({
      type: "Overgeneralising",
      explanation: "Statements like “always” or “never” point to sweeping conclusions.",
      examples: ["This always happens to me", "I never get it right"],
      fallback: true,
    });
  }

  if (/they must think|i know what they think|they probably/.test(combined)) {
    distortions.push({
      type: "Mind-reading",
      explanation: "Assuming others’ thoughts without evidence.",
      examples: ["They must think I’m incompetent"],
      fallback: true,
    });
  }

  if (/everything will go wrong|disaster|ruined|nothing will work/.test(combined)) {
    distortions.push({
      type: "Catastrophising",
      explanation: "Jumping to worst-case scenarios quickly.",
      examples: ["This will become a disaster"],
      fallback: true,
    });
  }

  if (/i feel.*so it must be true/.test(combined) || /because i'm sad it means/.test(combined)) {
    distortions.push({
      type: "Emotional reasoning",
      explanation: "Treating feelings like facts.",
      examples: ["I feel rejected, so it must mean they hate me"],
      fallback: true,
    });
  }

  if (distortions.length === 0) {
    distortions.push({
      type: "No strong distortions",
      explanation: "Keep sharing your thoughts—I’ll call out unhelpful patterns when I see them.",
      examples: [],
      fallback: true,
    });
  }

  return distortions.slice(0, 3);
}

function parseDistortions(raw: string | undefined): CognitiveDistortion[] {
  if (!raw) return [];
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): CognitiveDistortion | null => {
      const [typePart, rest] = line.split(":").map((part) => part.trim());
      if (!typePart || !rest) return null;
      const exampleMatch = rest.match(/Examples?\s*:\s*(.+)$/i);
      const examples = exampleMatch ? exampleMatch[1].split(";").map((ex) => ex.trim()) : [];
      const explanation = exampleMatch ? rest.replace(exampleMatch[0], "").trim() : rest;
      return {
        type: typePart,
        explanation,
        examples,
        fallback: false,
      };
    })
    .filter((item): item is CognitiveDistortion => Boolean(item))
    .slice(0, 5);
}

