// Summary: Core conversational orchestration for Vella, spanning intents, tone, and plan-aware routing.
import { z } from "zod";
import { openai, model } from "./client";
import { runWithOpenAICircuit } from "./circuitBreaker";
import { runFullAI, resolveModelForTier } from "@/lib/ai/fullAI";
import type { DailyContext } from "@/lib/ai/context/buildDailyContext";
import type { SupportedLanguageCode } from "@/lib/ai/languages";
import {
  ArchitectSummary,
  ClaritySections,
  CompassResult,
  DeepDiveResult,
  StrategyResult,
  EmotionAnalysis,
  AttachmentReport,
  IdentityProfile,
  EmotionIntelBundle,
  ConversationTurn,
  MemoryProfile,
  SessionState,
} from "./types";
import type { TonePreference, DailyCheckIn } from "@/lib/memory/types";
import { microStories } from "@/lib/ai/relational/microStories";
import { attachmentReflection } from "@/lib/ai/relational/attachment";
import { microIntervention } from "@/lib/ai/relational/interventions";
import { deriveEmotionalContinuity } from "@/lib/ai/relational/continuity";
import {
  deriveCognitiveThread,
  generateCognitiveThreadReflection,
} from "@/lib/ai/relational/cognitiveThread";
import { generateMicroReward } from "@/lib/ai/relational/microRewards";
import { pickInsightForConversation } from "@/lib/insights/conversationBridge";
import {
  resolveToneProfile,
  getToneProfileForPreference,
} from "@/lib/ai/intent/toneProfiles";
import { determineIntent, type IntentType } from "@/lib/ai/intent/router";
import { DEFAULT_MEMORY_PROFILE } from "@/lib/memory/types";
import { getUpgradeBlock, type PlanTier } from "@/lib/tiers/tierCheck";
import { storyModePremiumFeaturesEnabled } from "@/lib/tiers/featureGates";
import { generateLiteResponse } from "@/lib/ai/lite";
import { resolvePlanTier } from "@/lib/tiers/planUtils";
import { getRecentMessages, getSummary } from "@/lib/memory/conversation";
import type { ConversationMessage } from "@/lib/memory/conversation";
import { buildMemoryContext, getLatestCheckin, describeCheckinMood } from "@/lib/ai/memoryContext";
function resolvePatternsSummary(profile: MemoryProfile | null): string | null {
  if (!profile) return null;
  const insightPatterns = profile.insights && "patterns" in profile.insights ? profile.insights.patterns : null;
  const list =
    insightPatterns && Array.isArray(insightPatterns)
      ? insightPatterns
          .map((pattern) => pattern.description || pattern.label || null)
          .filter((entry): entry is string => Boolean(entry))
      : null;

  if (list && list.length > 0) {
    return list.slice(0, 3).join("; ");
  }

  const emotionalPatterns = profile.emotionalPatterns;
  if (emotionalPatterns && emotionalPatterns.commonPrimaryEmotions.length > 0) {
    return `Emotions like ${emotionalPatterns.commonPrimaryEmotions.slice(0, 3).join(", ")}`;
  }

  return null;
}
import { getUserTraits, type TraitScores } from "@/lib/traits/adaptiveTraits";
import { listGoals, type UserGoal } from "@/lib/goals/goalEngine";
import type { VoiceEmotionSnapshot } from "@/lib/voice/types";
import type { ConsistencyContext } from "@/lib/consistency/buildConsistencyContext";
import type { PersonalityProfile } from "@/lib/personality/getPersonalityProfile";
import { getAbsencePresenceMessage } from "@/lib/ai/engines/absencePresence";
import { getUserLastActive } from "@/lib/memory/lastActive";
import { updateLastActive } from "@/lib/profile/updateLastActive";
import { buildPersonaInstruction } from "@/lib/realtime/personaSynth";
import { DEFAULT_VELLA_SETTINGS } from "@/lib/settings/vellaSettings";
import type { ResponsePlan } from "@/lib/ai/scaffold/responseTemplate";
import {
  computeDeliveryHints,
  type VellaDeliveryContext,
  type MoodState,
} from "@/lib/realtime/deliveryEngine";
import type { RealtimeDeliveryMeta } from "@/lib/realtime/useRealtimeVella";
import type { VellaSettings } from "@/lib/settings/vellaSettings";
import {
  DEFAULT_VELLA_VOICE_ID,
  normalizeVellaVoiceId,
  type VellaVoiceId,
} from "@/lib/voice/vellaVoices";
import type { SupportedLanguage } from "@/lib/ai/language/languageProfiles";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import { normalizeInsightSnapshot } from "@/lib/ai/utils/normalizeInsights";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";
import type { MonitoringSnapshot } from "@/lib/monitor/types";
import type { EmotionalState } from "@/lib/realtime/emotion/state";
import type { HealthState } from "@/lib/realtime/health/state";

const DEFAULT_VOICE_HUD = DEFAULT_VELLA_SETTINGS.voiceHud;

// Moved from deprecated persona.ts
export type VellaPersonaMode = "soft_calm" | "warm_playful" | "stoic_coach";

type PersonaParams = {
  mood?: string | null;
  patternsSummary?: string | null;
  recentMessage?: string | null;
};

const SOFT_KEYWORDS = ["anxious", "worried", "overwhelmed", "tired", "sad", "heavy", "lonely", "stressed"];
const PLAYFUL_KEYWORDS = ["excited", "happy", "grateful", "optimistic", "hopeful", "energised", "energized", "good news"];
const STOIC_KEYWORDS = ["conflict", "decision", "boundary", "discipline", "plan", "strategy"];

export function choosePersonaMode(params: PersonaParams): VellaPersonaMode {
  const msg = (params.recentMessage ?? "").toLowerCase();
  const mood = (params.mood ?? "").toLowerCase();
  const patterns = (params.patternsSummary ?? "").toLowerCase();

  if (matchesAny(msg, SOFT_KEYWORDS) || matchesAny(mood, SOFT_KEYWORDS) || matchesAny(patterns, SOFT_KEYWORDS)) {
    return "soft_calm";
  }

  if (matchesAny(msg, PLAYFUL_KEYWORDS) || matchesAny(mood, PLAYFUL_KEYWORDS)) {
    return "warm_playful";
  }

  if (matchesAny(patterns, STOIC_KEYWORDS) || matchesAny(msg, ["stuck", "uncertain", "decision"])) {
    return "stoic_coach";
  }

  return "stoic_coach";
}

function matchesAny(target: string, keywords: string[]): boolean {
  if (!target) return false;
  return keywords.some((keyword) => target.includes(keyword));
}

const LANGUAGE_NAMES: Record<SupportedLanguageCode, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese (BR)",
  ar: "Arabic",
  fr: "French",
  ja: "Japanese",
};

const stableChance = (seed: string, threshold: number): boolean => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const normalized = ((hash >>> 0) % 1000) / 1000;
  return normalized < threshold;
};

const pickDeterministic = <T>(items: T[], seed: string): T => {
  if (items.length === 0) {
    throw new Error("Cannot pick from empty list");
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % items.length;
  return items[index]!;
};

type RealtimeInsightPayload = {
  title?: string | null;
  summary?: string | null;
  description?: string | null;
};

type SanitizedRealtimeInsight = {
  title: string;
  summary: string;
};

type ResponsePlanPayload = {
  intent?: string | null;
  emotionalGoal?: string | null;
  keyPoints?: string[] | null;
  narrativeFlow?: string[] | null;
};

export type InsightRealtimeContext = {
  behaviourVector?: BehaviourVector | null;
  monitoring?: MonitoringSnapshot | null;
  emotionalState?: EmotionalState | null;
  insights?: RealtimeInsightPayload[] | null;
  toneStyle?: TonePreference | null;
  relationshipMode?: MemoryProfile["relationshipMode"] | null;
  language?: SupportedLanguageCode | null;
  voiceId?: VellaVoiceId | string | null;
  moodState?: MoodState | null;
  healthState?: HealthState | null;
  responsePlan?: ResponsePlanPayload | null;
};

let responsePlanFallbackLogged = false;

function logResponsePlanFallback() {
  if (responsePlanFallbackLogged || process.env.NODE_ENV === "production") {
    return;
  }
  console.warn("[AGENTS:DEGRADED] responsePlan payload incomplete; ignoring.");
  responsePlanFallbackLogged = true;
}

function normalizeRealtimeInsightPayload(
  payload?: InsightRealtimeContext["insights"],
): SanitizedRealtimeInsight[] | null {
  if (!payload || payload.length === 0) {
    return null;
  }
  const normalized = payload
    .map((entry) => {
      if (!entry) return null;
      const rawTitle = (entry.title ?? entry.description ?? "").trim();
      if (!rawTitle) return null;
      const summary = (entry.summary ?? entry.description ?? "").trim();
      return {
        title: rawTitle,
        summary,
      };
    })
    .filter((entry): entry is SanitizedRealtimeInsight => entry !== null);
  return normalized.length ? normalized : null;
}

function normalizeResponsePlanPayload(
  payload?: InsightRealtimeContext["responsePlan"],
): ResponsePlan | null {
  if (!payload) {
    return null;
  }
  const intent = (payload.intent ?? "").trim();
  const emotionalGoal = (payload.emotionalGoal ?? "").trim();
  const keyPoints = Array.isArray(payload.keyPoints)
    ? payload.keyPoints.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const narrativeFlow = Array.isArray(payload.narrativeFlow)
    ? payload.narrativeFlow.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (!intent && !emotionalGoal && keyPoints.length === 0 && narrativeFlow.length === 0) {
    logResponsePlanFallback();
    return null;
  }

  return {
    intent,
    emotionalGoal,
    keyPoints,
    narrativeFlow,
  };
}

export type ConversationMode =
  | "default"
  | "deep_reflection"
  | "execution_coach"
  | "stoic_mentor"
  | "clarity_mode"
  | "behaviour_analysis"
  | "mindset_reset"
  | "voice"
  | "audio";

const claritySchema = z.object({
  facts: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  biases: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
});

const strategySchema = z.object({
  inControl: z.array(z.string()).default([]),
  outOfControl: z.array(z.string()).default([]),
  stoicReframe: z.string().default(""),
  rationalPlan: z.array(z.string()).default([]),
  ifThenPlans: z
    .array(
      z.object({
        condition: z.string(),
        response: z.string(),
      }),
    )
    .default([]),
  mindsetForToday: z.string().default(""),
});

const deepDiveSchema = z.object({
  summary: z.string(),
  alternativeViews: z.array(z.string()),
  suggestedQuestions: z.array(z.string()),
});

const compassSchema = z.object({
  immediateSteps: z.array(z.string()),
  calmingReframe: z.string(),
  whatToAvoid: z.array(z.string()),
});

const emotionSchema = z.object({
  primaryEmotion: z.string(),
  secondaryEmotions: z.array(z.string()).default([]),
  hiddenEmotions: z.array(z.string()).default([]),
  physicalSensations: z.array(z.string()).default([]),
  cognitivePatterns: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),
  underlyingFears: z.array(z.string()).default([]),
  diagnosticQuestions: z.array(z.string()).default([]),
  possibleAnswers: z.array(z.string()).default([]),
  meaning: z.string().default(""),
  regulationStrategies: z.array(z.string()).default([]),
  shortTermPlan: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (typeof val === "string" ? [val] : val))
    .default([]),
});

const attachmentSchema = z.object({
  probableStyles: z.array(z.string()).default([]),
  supportingSignals: z.array(z.string()).default([]),
  relationalPatterns: z.array(z.string()).default([]),
  typicalTriggers: z.array(z.string()).default([]),
  protectiveStrategies: z.array(z.string()).default([]),
  growthSuggestions: z.array(z.string()).default([]),
  journalingPrompts: z.array(z.string()).default([]),
});

const identitySchema = z.object({
  coreValues: z.array(z.string()).default([]),
  recurringDilemmas: z.array(z.string()).default([]),
  selfStories: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  blindSpots: z.array(z.string()).default([]),
  growthEdges: z.array(z.string()).default([]),
  reflectionPrompts: z.array(z.string()).default([]),
});

function mockClarity(): ClaritySections {
  return {
    facts: ["You are facing a decision and feel uncertain."],
    unknowns: [
      "You are not sure how others will respond.",
      "You are unsure about long-term impact.",
    ],
    assumptions: ["You assume the worst outcome is more likely than it really is."],
    biases: ["Catastrophising", "Mind-reading"],
    contradictions: ["You want calm but are feeding the anxiety with rumination."],
    questions: ["What do you actually want here?", "What is fully in your control today?"],
  };
}

function mockStrategy(): StrategyResult {
  return {
    inControl: ["How you respond", "The speed of your reply", "The boundary you set"],
    outOfControl: ["Other people’s feelings", "Past events"],
    stoicReframe:
      "This is an opportunity to practice choosing a measured response instead of reacting from fear.",
    rationalPlan: [
      "Pause and write down the core facts in one sentence.",
      "Decide the outcome you want from this situation.",
      "Choose a short, honest response that moves you one step toward that outcome.",
    ],
    ifThenPlans: [
      {
        condition: "If the other person reacts strongly",
        response:
          "Acknowledge their feeling once, restate your boundary, and avoid defending yourself repeatedly.",
      },
      {
        condition: "If you start overthinking again",
        response:
          "Return to your one-sentence summary of the facts and take the next concrete action only.",
      },
    ],
    mindsetForToday: "Calm, slow, and deliberate. You are allowed to respond later, not instantly.",
  };
}

async function loadServerVellaSettings(userId?: string | null): Promise<VellaSettings> {
  if (!userId) {
    return DEFAULT_VELLA_SETTINGS;
  }
  try {
    const persona = await loadServerPersonaSettings(userId);
    if (!persona) {
      return DEFAULT_VELLA_SETTINGS;
    }
    return {
      voiceModel: persona.voiceModel ?? DEFAULT_VELLA_SETTINGS.voiceModel,
      tone: persona.tone ?? DEFAULT_VELLA_SETTINGS.tone,
      toneStyle: persona.toneStyle ?? persona.tone ?? DEFAULT_VELLA_SETTINGS.toneStyle,
      relationshipMode: persona.relationshipMode ?? DEFAULT_VELLA_SETTINGS.relationshipMode,
      voiceHud: DEFAULT_VOICE_HUD,
    };
  } catch (err) {
    console.error("[agents] loadServerVellaSettings failed", err);
    return DEFAULT_VELLA_SETTINGS;
  }
}

function mockDeepDive(): DeepDiveResult {
  return {
    summary: "You are over-attaching to how others might react instead of anchoring to your own values.",
    alternativeViews: [
      "The other person may handle your honesty better than you expect.",
      "You might be over-estimating how much attention others give this situation.",
    ],
    suggestedQuestions: [
      "If I was advising a friend, what would I tell them to do?",
      "What decision aligns best with my long-term self-respect?",
    ],
  };
}

function mockCompass(): CompassResult {
  return {
    immediateSteps: [
      "Name what you are feeling in one word.",
      "Take three slow breaths before you write or say anything.",
      "Write a draft response you do not send yet.",
    ],
    calmingReframe:
      "You are allowed to slow this moment down. You do not need the perfect response, only a steady one.",
    whatToAvoid: [
      "Do not reply while your heart is racing.",
      "Avoid re-reading old messages repeatedly.",
    ],
  };
}

function mockArchitect(): ArchitectSummary {
  return {
    clarityScore: 72,
    biasTrends: ["Catastrophising is decreasing", "All-or-nothing thinking appears on stressful days"],
    recurringThemes: ["Fear of disappointing others", "Uncertainty around career moves"],
    forecast:
      "Expect similar doubts to surface around new opportunities next month. Prepare one default calm response in advance.",
  };
}

function mockEmotion(): EmotionAnalysis {
  return {
    primaryEmotion: "anxiety",
    secondaryEmotions: ["insecurity"],
    hiddenEmotions: ["fear of rejection"],
    physicalSensations: ["tight chest", "restlessness"],
    cognitivePatterns: ["catastrophising", "mind-reading"],
    triggers: ["uncertainty in relationships", "waiting for a reply"],
    underlyingFears: ["being abandoned", "not being enough"],
    diagnosticQuestions: [
      "What outcome are you most afraid of here?",
      "When have you felt this way before in your life?",
      "What would you do if you trusted that you could handle any response?",
    ],
    possibleAnswers: [
      "I'm afraid they'll leave or lose interest.",
      "I'm afraid I'm not good enough.",
      "I'm afraid of being humiliated.",
    ],
    meaning: "This anxiety is signalling a perceived threat to connection and self-worth.",
    regulationStrategies: [
      "Name the emotion out loud and rate its intensity 1–10.",
      "Take 3 slow breaths with a longer exhale.",
      "Write one sentence describing the situation only in facts.",
      "Delay any message you want to send by 10 minutes.",
    ],
    shortTermPlan: [
      "Pause and name the emotion.",
      "Ground yourself with breathing for 60 seconds.",
      "Write a draft of what you want to say.",
      "Review it once your body feels 20% calmer.",
    ],
  };
}

function mockAttachment(): AttachmentReport {
  return {
    probableStyles: ["anxious-leaning", "secure under low stress"],
    supportingSignals: [
      "Strong emotional reactions to perceived distance",
      "Preoccupation with how others feel about you",
    ],
    relationalPatterns: [
      "Over-analyse messages and delays",
      "Struggle to trust that people will stay without proof",
    ],
    typicalTriggers: [
      "Short, ambiguous replies",
      "Changes in tone or availability",
    ],
    protectiveStrategies: [
      "Seek clarity rather than proof",
      "State needs calmly instead of testing people",
    ],
    growthSuggestions: [
      "Practice assuming good intent first",
      "Notice when you chase reassurance instead of clarity",
      "Learn to self-soothe before reaching out",
    ],
    journalingPrompts: [
      "What am I afraid this situation says about me?",
      "If I fully trusted my worth, what would change in my response?",
      "What patterns do I recognise from past relationships?",
    ],
  };
}

function mockIdentity(): IdentityProfile {
  return {
    coreValues: ["honesty", "loyalty", "emotional connection"],
    recurringDilemmas: ["Wanting closeness but fearing dependence", "Wanting to be chosen but doubting your worth"],
    selfStories: ["I might not be enough for people to stay", "If I show too much, I'll be rejected"],
    strengths: ["High emotional awareness", "Capacity for deep connection", "Strong intuition about people"],
    blindSpots: ["Confusing anxiety with truth", "Interpreting silence as rejection"],
    growthEdges: ["Separating feelings from facts", "Acting from values rather than fear"],
    reflectionPrompts: [
      "What kind of person do I want to be in relationships?",
      "How would I act if I believed I am already enough?",
      "Which stories about myself am I ready to question?",
    ],
  };
}

async function callOpenAIJson<T>(
  schema: z.ZodSchema<T>,
  system: string,
  user: string,
): Promise<T> {
  const client = openai;
  if (!client) {
    throw new Error("NO_OPENAI");
  }

  const response = await runWithOpenAICircuit(() =>
    client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            system +
            " Always respond with a single JSON object that matches the provided schema. No markdown, no commentary.",
        },
        { role: "user", content: user },
      ],
    })
  );

  const raw = response.choices[0]?.message?.content ?? "{}";
  return schema.parse(JSON.parse(raw));
}

export async function runClarityEngine(input: {
  freeText: string;
  frame?: {
    whatHappened?: string;
    feeling?: string;
    desiredOutcome?: string;
    fear?: string;
  };
}): Promise<ClaritySections> {
  if (!openai) return mockClarity();

  const userPrompt = JSON.stringify(input, null, 2);

  try {
    return await callOpenAIJson(
      claritySchema,
      `
You are the Clarity Engine for an app called Vella.

Your job:
- Strip away exaggeration and drama
- Identify clean factual statements
- Highlight unknowns and assumptions
- Detect emotional or cognitive biases
- Point out contradictions
- Propose a few key self-reflection questions

Output structure (JSON):
{
  "facts": string[],
  "unknowns": string[],
  "assumptions": string[],
  "biases": string[],
  "contradictions": string[],
  "questions": string[]
}
      `,
      userPrompt,
    );
  } catch (err) {
    console.error("runClarityEngine error", err);
    return mockClarity();
  }
}

export async function runStoicStrategist(params: {
  clarity: ClaritySections;
}): Promise<StrategyResult> {
  if (!openai) return mockStrategy();

  const userPrompt = JSON.stringify(params, null, 2);

  try {
    return await callOpenAIJson(
      strategySchema,
      `
You are the Stoic Strategist for Vella.

Use the structured clarity sections to:
- Separate what is in the user's control vs out of their control
- Apply Stoic principles (dichotomy of control, perspective, impermanence, voluntary discomfort, etc.)
- Propose a rational, minimal action plan
- Offer If X → Then Y responses for likely scenarios
- Suggest one short mindset sentence for today

Output structure (JSON):
{
  "inControl": string[],
  "outOfControl": string[],
  "stoicReframe": string,
  "rationalPlan": string[],
  "ifThenPlans": { "condition": string, "response": string }[],
  "mindsetForToday": string
}
      `,
      userPrompt,
    );
  } catch (err) {
    console.error("runStoicStrategist error", err);
    return mockStrategy();
  }
}

export async function runDeepDive(input: {
  section: string;
  text: string;
}): Promise<DeepDiveResult> {
  if (!openai) return mockDeepDive();

  const userPrompt = JSON.stringify(input, null, 2);

  try {
    return await callOpenAIJson(
      deepDiveSchema,
      `
You are a Deep Dive lens inside Vella.

Given a specific sentence from the clarity or strategy output, your job is to:
- Summarise what it really points to
- Offer 2–4 alternative ways of viewing the situation
- Suggest 2–4 reflective questions the user can journal on

Output structure (JSON):
{
  "summary": string,
  "alternativeViews": string[],
  "suggestedQuestions": string[]
}
      `,
      userPrompt,
    );
  } catch (err) {
    console.error("runDeepDive error", err);
    return mockDeepDive();
  }
}

export async function runCompassMode(input: {
  raw: string;
}): Promise<CompassResult> {
  if (!openai) return mockCompass();

  const userPrompt = JSON.stringify(input, null, 2);

  try {
    return await callOpenAIJson(
      compassSchema,
      `
You are the Compass Mode emergency helper in Vella.

User is emotionally overwhelmed. They need:
- 2–4 immediate concrete steps for the next 10–30 minutes
- One short calming reframe
- 2–4 things to avoid doing right now

Keep language simple and grounded.

Output structure (JSON):
{
  "immediateSteps": string[],
  "calmingReframe": string,
  "whatToAvoid": string[]
}
      `,
      userPrompt,
    );
  } catch (err) {
    console.error("runCompassMode error", err);
    return mockCompass();
  }
}

export async function runLifeArchitect(userId: string): Promise<ArchitectSummary> {
  return mockArchitect();
}

export async function runEmotionLens(input: { text: string }): Promise<EmotionAnalysis> {
  if (!openai) return mockEmotion();

  const userPrompt = JSON.stringify(input, null, 2);

  try {
    return await callOpenAIJson(
      emotionSchema,
      `
You are the EmotionLens inside Vella.

Your job:
- Identify the user's primary and secondary emotions
- Infer possible hidden emotions beneath the surface
- Note physical sensations and cognitive patterns
- Identify likely triggers and underlying fears
- Ask diagnostic questions to help the user explore deeper
- Suggest plausible answers based on common patterns (make clear they are possibilities, not facts)
- Explain what this emotion might be signalling in their life
- Offer short, practical regulation strategies
- End with a simple, concrete short-term plan for the next 10–30 minutes

Output structured JSON only.
      `,
      userPrompt,
    );
  } catch (err) {
    console.error("runEmotionLens error", err);
    return mockEmotion();
  }
}

export async function runAttachmentAnalyzer(input: { text: string }): Promise<AttachmentReport> {
  if (!openai) return mockAttachment();

  const userPrompt = JSON.stringify(input, null, 2);

  try {
    return await callOpenAIJson(
      attachmentSchema,
      `
You are the Attachment & Relational Pattern analyzer in Vella.

Given the user's words about a situation, you:
- Infer possible attachment style tendencies (anxious, avoidant, secure, mixed), but NEVER state a diagnosis
- List textual signals that support your interpretation
- Describe recurring relational patterns that might be present
- Identify typical triggers for these patterns
- Offer protective strategies that move them toward more secure relating
- Suggest growth-focused behavioural experiments
- Provide journaling prompts for deeper exploration

Output structured JSON only.
      `,
      userPrompt,
    );
  } catch (err) {
    console.error("runAttachmentAnalyzer error", err);
    return mockAttachment();
  }
}

export async function runIdentityMirror(input: { text: string }): Promise<IdentityProfile> {
  if (!openai) return mockIdentity();

  const userPrompt = JSON.stringify(input, null, 2);

  try {
    return await callOpenAIJson(
      identitySchema,
      `
You are the Identity Mirror in Vella.

Given the user's description of their situation and feelings, you:
- Infer core values that seem important to them
- Highlight recurring dilemmas they may be facing
- Surface self-stories they might be telling themselves
- Point out strengths that are visible in how they think/feel
- Gently surface likely blind spots
- Identify growth edges (where they can mature)
- Offer reflection prompts that help them understand themselves better

Stay non-pathologising, non-judgemental, and empowering.

Output structured JSON only.
      `,
      userPrompt,
    );
  } catch (err) {
    console.error("runIdentityMirror error", err);
    return mockIdentity();
  }
}

export async function runEmotionIntelBundle(input: { text: string }): Promise<EmotionIntelBundle> {
  const emotion = await runEmotionLens({ text: input.text });
  const attachment = await runAttachmentAnalyzer({ text: input.text });
  const identity = await runIdentityMirror({ text: input.text });

  return { emotion, attachment, identity };
}

function mapModeToFeatureKey(mode: ConversationMode): string {
  switch (mode) {
    case "deep_reflection":
      return "mode_deep_reflection";
    case "execution_coach":
      return "mode_execution_coach";
    case "stoic_mentor":
      return "mode_stoic_mentor";
    case "clarity_mode":
      return "mode_clarity";
    case "behaviour_analysis":
      return "mode_behaviour_analysis";
    case "mindset_reset":
      return "mode_mindset_reset";
    default:
      return "mode_default";
  }
}

function buildModeSystemPrompt(
  mode: ConversationMode,
  basePrompt: string,
  context: { userTraits?: TraitScores | null; goalsSummary?: string | null },
): string {
  const directives: string[] = [basePrompt];
  const modeDirectives: Record<ConversationMode, string> = {
    default:
      "Stay balanced, emotionally intelligent, and responsive to their cues. Blend validation with gentle direction.",
    deep_reflection:
      "You are in deep reflection mode: slow pacing, ask thoughtful questions, explore underlying feelings and needs, avoid rushing to solutions.",
    execution_coach:
      "You are in execution coach mode: clarify goals, constraints, and next actions. Help them prioritise, break tasks down, and set simple commitments.",
    stoic_mentor:
      "You are in stoic mentor mode: lean on Stoic principles (dichotomy of control, virtue, acceptance, amor fati). Stay calm, rational, and grounding.",
    clarity_mode:
      "You are in clarity mode: untangle confusion, summarise their situation plainly, surface options, and highlight what matters most.",
    behaviour_analysis:
      "You are in behaviour analysis mode: identify recurring loops, triggers, and consequences. Mirror patterns and help them experiment with new responses.",
    mindset_reset:
      "You are in mindset reset mode: gently challenge limiting beliefs, offer alternative interpretations, and encourage empowering self-talk.",
    voice:
      "You are in voice-first mode: lean on concise spoken phrasing, keep warmth without filler, and prioritise pacing guidance.",
    audio:
      "You are supporting audio ambience: describe the suggested soundbed in one short line and tether it to the user's emotional state.",
  };

  directives.push(`Mode directive: ${modeDirectives[mode]}`);

  const traitHints = buildTraitHints(context.userTraits);
  if (traitHints.length > 0) {
    directives.push(traitHints.join(" "));
  }

  if (context.goalsSummary) {
    directives.push(
      `Goal context: ${context.goalsSummary}. Reference or reinforce their active goals when it helps.`,
    );
  }

  return directives.join("\n\n");
}

function buildTraitHints(traits?: TraitScores | null): string[] {
  if (!traits) return [];
  const hints: string[] = [];
  if (traits.resilience >= 65) {
    hints.push("They have high resilience; acknowledge and build on it.");
  } else if (traits.resilience <= 40) {
    hints.push("Resilience feels strained; stay extra grounding and validating.");
  }

  if (traits.discipline <= 45) {
    hints.push("Discipline is lower; keep plans simple, structured, and encouraging.");
  }

  if (traits.clarity <= 45) {
    hints.push("Clarity is low; summarise and reflect back frequently.");
  }

  if (traits.motivation <= 45) {
    hints.push("Motivation is softer; highlight tiny wins and momentum cues.");
  }

  if (traits.self_compassion <= 45) {
    hints.push("Self-compassion is shaky; use gentle language and normalise the struggle.");
  }

  return hints;
}

function summarizeGoalsForMode(goals: UserGoal[]): string | null {
  if (!goals || goals.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const goal of goals) {
    const key = goal.type ?? "other";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const parts = ["life", "focus", "weekly"]
    .map((type) => (counts[type] ? `${capitalize(type)}: ${counts[type]}` : null))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function runConversationalGuide(input: {
  history: ConversationTurn[];
  latestUserMessage: string;
  depthMode?: "light" | "balanced" | "deep" | "reflective";
  emotionIntel?: EmotionIntelBundle | null;
  memoryProfile?: MemoryProfile | null;
  tonePreferenceOverride?: TonePreference | null;
  sessionState?: SessionState | null;
  preferredLanguage?: SupportedLanguageCode;
  userLocalTime?: string;
  userLocalDate?: string;
  userLocalDateTime?: string;
  userTimezone?: string;
  mode?: ConversationMode;
  dailyContext?: DailyContext | null;
  tierBlock?: string | null;
  longTermMemory?: unknown;
  voiceContext?: {
    emotion: VoiceEmotionSnapshot | null;
    intent: string | null;
  } | null;
  consistencyContext?: ConsistencyContext | null;
  calmModeDirective?: string | null;
  personalityPrompt?: string | null;
  stylePrompt?: string | null;
  personalityProfile?: PersonalityProfile | null;
  progressBlock?: string | null;
  behaviourMapPrompt?: string | null;
  overloadPrompt?: string | null;
  overloadDirective?: string | null;
  socialModelPrompt?: string | null;
  sleepEnergyPrompt?: string | null;
  connectionDepthPrompt?: string | null;
  connectionDepth?: number | null;
  vellaWorldPrompt?: string | null;
  realtime?: InsightRealtimeContext | null;
}): Promise<
  | { type: "upgrade_required"; message: string }
  | { type: "lite_mode"; message: string }
  | { type: "ai_response"; message: string }
  | { type: "error"; message: string }
> {
  const fallbackNow = new Date();
  const fallbackTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const fallbackTime = fallbackNow.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const fallbackDate = fallbackNow.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const fallbackDateTime = `${fallbackDate} ${fallbackTime}`;

  const {
    history,
    latestUserMessage: latestUserMessageInput,
    depthMode = "balanced",
    emotionIntel,
    memoryProfile,
    tonePreferenceOverride: _tonePreferenceOverride,
    sessionState,
    preferredLanguage,
    userLocalTime = fallbackTime,
    userLocalDate = fallbackDate,
    userLocalDateTime = fallbackDateTime,
    userTimezone = fallbackTimezone,
    mode = "default",
    dailyContext = null,
    tierBlock = "",
    longTermMemory = null,
    voiceContext = null,
    consistencyContext = null,
    calmModeDirective = null,
    personalityPrompt = null,
    stylePrompt = null,
    personalityProfile = null,
    progressBlock = null,
    behaviourMapPrompt = null,
    overloadPrompt = null,
    overloadDirective = null,
    socialModelPrompt = null,
    sleepEnergyPrompt = null,
    connectionDepthPrompt = null,
    connectionDepth = 0,
    vellaWorldPrompt = null,
    realtime = null,
  } = input;
  const resolvedProfile: MemoryProfile = memoryProfile ? { ...memoryProfile } : { ...DEFAULT_MEMORY_PROFILE };
  resolvedProfile.insights = normalizeInsightSnapshot(resolvedProfile.insights);
  const responseLanguage: SupportedLanguageCode =
    preferredLanguage ?? resolvedProfile.preferredLanguage ?? "en";
  const conversationMode: ConversationMode = mode ?? "default";
  const planTier: PlanTier = resolvePlanTier(resolvedProfile.plan as string | undefined);
  const chosenModel = await resolveModelForTier(planTier);
  const modeFeatureKey = mapModeToFeatureKey(conversationMode);
  const modeBlock = getUpgradeBlock(planTier, modeFeatureKey);
  if (modeBlock) {
    if (resolvedProfile.userId) {
      await updateLastActive(resolvedProfile.userId);
    }
    return { type: "upgrade_required", message: modeBlock };
  }
  const latestCheckin = getLatestCheckin(resolvedProfile);
  const moodDescriptor = describeCheckinMood(latestCheckin);
  const persona = choosePersonaMode({
    mood: moodDescriptor,
    recentMessage: latestUserMessageInput,
  });
  const userId = resolvedProfile.userId ?? null;
  let shortTermMessages: ConversationMessage[] = [];
  let threadSummary: string | null = null;
  let traitsSnapshot: TraitScores | null = null;
  let goalsSummary: string | null = null;

  if (userId) {
    const summaryPromise = planTier === "free" ? Promise.resolve(null) : getSummary(userId);
    const goalsPromise = listGoals(userId).catch((error) => {
      console.error("[agents] listGoals error", error);
      return [];
    });
    const traitsPromise = getUserTraits(userId).catch((error) => {
      console.error("[agents] getUserTraits error", error);
      return null;
    });
    const [recent, summary, goals, traits] = await Promise.all([
      getRecentMessages(userId, 10),
      summaryPromise,
      goalsPromise,
      traitsPromise,
    ]);
    shortTermMessages = recent;
    threadSummary = summary;
    traitsSnapshot = traits;
    goalsSummary = summarizeGoalsForMode(goals);
  }
  const resolvedPatternsSummary = resolvePatternsSummary(resolvedProfile);
  const memoryContext = buildMemoryContext({
    recentMessages: shortTermMessages,
    threadSummary,
    patternsSummary: resolvedPatternsSummary,
  });
  const respondWithCasual = async (message: string): Promise<string> => {
    const [engineModule, stateModule] = await Promise.all([
      import("@/lib/ai/hse/engine"),
      import("@/lib/ai/hse/state"),
    ]);
    const casualResult = await engineModule.generateCasualReply(
      message,
      resolvedProfile,
      stateModule.DEFAULT_HSE_STATE,
    );
    return casualResult.reply;
  };

  const intent = await determineIntent(latestUserMessageInput);

  const anchoredUserMessage =
    findMostRecentUserTurn(history)?.content ?? latestUserMessageInput;
  const allowTherapeutic = intent === "EMOTIONAL_SUPPORT";
  const allowStoic = intent === "PHILOSOPHY";

  const recentTurns = history.slice(-8);

  const intentLabel = intent as string;
  if (intentLabel === "SMALLTALK" || intentLabel === "PLAYFUL") {
    const casual = await respondWithCasual(latestUserMessageInput);
    return { type: "ai_response", message: casual };
  }

  if (!openai) {
    const liteMessage = await generateLiteResponse(anchoredUserMessage, persona);
    return {
      type: "lite_mode",
      message: liteMessage,
    };
  }

  const baseToneProfile = resolveToneProfile(intent);
  const resolvedTonePreference =
    _tonePreferenceOverride ?? resolvedProfile.tonePreference ?? baseToneProfile.tonePreference;
  const toneProfile =
    resolvedTonePreference === baseToneProfile.tonePreference
      ? baseToneProfile
      : getToneProfileForPreference(resolvedTonePreference);
  const effectiveTone: TonePreference = toneProfile.tonePreference;
  const safeDailyContext = sanitizeDailyContextForTier(planTier, dailyContext);
  const safeLongTermMemory = sanitizeSnapshotForTier(planTier, longTermMemory);
  const safeVoiceEmotion = voiceContext?.emotion ?? null;
  const normalizedConnectionDepth = clamp01(connectionDepth ?? 0);

  let daysAbsent = 0;
  if (userId) {
    daysAbsent = await getUserLastActive(userId);
  }

  if (userId) {
    const absenceTone = mapAbsenceTone(persona, effectiveTone);
    const absence = getAbsencePresenceMessage({
      daysAbsent,
      connectionScore: normalizedConnectionDepth,
      tone: absenceTone,
    });
    await updateLastActive(userId);
    if (absence.shouldShow && absence.message) {
      return { type: "ai_response", message: absence.message };
    }
  }

  if (intent === "SMALLTALK" || intent === "PLAYFUL") {
    const casual = await respondWithCasual(latestUserMessageInput);
    return { type: "ai_response", message: casual };
  }

  const personaVoiceId = (resolvedProfile.voiceModel ?? DEFAULT_VELLA_VOICE_ID) as VellaVoiceId;
  const personaMoodState: MoodState = allowTherapeutic ? "soothing" : "neutral";
  const deliveryContext: VellaDeliveryContext = {
    voiceId: personaVoiceId,
    moodState: personaMoodState,
  };
  const deliveryHints = computeDeliveryHints(deliveryContext);
  const alignedVellaSettings = await loadServerVellaSettings(userId);
  const personaSettingsSnapshot: VellaSettings = {
    voiceModel: personaVoiceId,
    tone: alignedVellaSettings.tone ?? resolvedTonePreference,
    toneStyle: alignedVellaSettings.toneStyle ?? "soft",
    relationshipMode: alignedVellaSettings.relationshipMode ?? "companion",
    voiceHud: alignedVellaSettings.voiceHud ?? DEFAULT_VOICE_HUD,
  };
  const personaInstruction = await buildPersonaInstruction({
    voiceId: personaVoiceId,
    moodState: personaMoodState,
    delivery: deliveryHints,
    relationshipMode: personaSettingsSnapshot.relationshipMode,
    userSettings: personaSettingsSnapshot,
    language: responseLanguage as SupportedLanguage,
    userText: latestUserMessageInput,
    insights: resolvedProfile.insights ?? null,
    behaviourVector: resolvedProfile.behaviourVector ?? null,
  });
  const personaPrompt = buildModeSystemPrompt(conversationMode, personaInstruction, {
    userTraits: traitsSnapshot,
    goalsSummary,
  });
  const realtimeBridge = buildRealtimeBridgePayload({
    realtime,
    personaVoiceId,
    personaMoodState,
    responseLanguage,
    personaSettingsSnapshot,
    memoryProfile: resolvedProfile,
  });
  const timeContextPrompt = `User local time: ${userLocalTime}. Date: ${userLocalDate} (${userTimezone}).`;

  const voicePrompt = buildVoicePrompt(voiceContext);
  const consistencyPrompt = buildConsistencyPrompt(consistencyContext);
  const calmPrompt = calmModeDirective ? calmModeDirective : null;
  const lightModePrompt = overloadDirective ?? null;
  const personalityContextPrompt = personalityPrompt ?? null;
  const styleContextPrompt = stylePrompt ?? null;
  const progressPrompt = progressBlock ?? null;
  const behaviourPrompt = behaviourMapPrompt ?? null;
  const overloadPromptBlock = overloadPrompt ?? null;
  const socialPrompt = socialModelPrompt ?? null;
  const sleepEnergyBlock = sleepEnergyPrompt ?? null;
  const connectionDepthBlock = connectionDepthPrompt ?? null;
  const vellaWorldBlock = vellaWorldPrompt ?? null;

  const warmthDirective = `Maintain a warm, emotionally present tone. Be supportive but not overbearing.`;

  const systemPromptParts = [
    voicePrompt,
    calmPrompt,
    lightModePrompt,
    consistencyPrompt,
    personalityContextPrompt,
    styleContextPrompt,
    progressPrompt,
    behaviourPrompt,
    overloadPromptBlock,
    socialPrompt,
    sleepEnergyBlock,
    vellaWorldBlock,
    connectionDepthBlock,
    buildContextPrompt(tierBlock, safeLongTermMemory, safeDailyContext),
    personaPrompt,
    warmthDirective,
    timeContextPrompt,
  ];
  if (responseLanguage !== "en") {
    systemPromptParts.push(
      `You MUST respond entirely in ${LANGUAGE_NAMES[responseLanguage]} (${responseLanguage.toUpperCase()}) unless the user explicitly requests another language.`,
    );
  }
  const combinedSystemPrompt = systemPromptParts.filter(Boolean).join("\n\n");

  const userMessages = recentTurns.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const lastTurn = userMessages[userMessages.length - 1];
  if (!lastTurn || lastTurn.role !== "user" || lastTurn.content !== anchoredUserMessage) {
    userMessages.push({ role: "user", content: anchoredUserMessage });
  }

  try {
    let featureKey = determineFeatureKey(latestUserMessageInput);
    let storyUpsellMessage: string | null = null;

    // ---------------------------------------------------------
    // STORY MODE PREMIUM GATE (LONG STORIES ONLY)
    // ---------------------------------------------------------
    if (featureKey === "story_long") {
      const premium = storyModePremiumFeaturesEnabled(planTier);

      if (!premium) {
        // DOWNGRADE to short story mode silently
        console.debug("[StoryGate] Long story request downgraded for free tier.");

        // We override the feature key locally so downstream logic
        // behaves exactly like a short story request.
        featureKey = "story_short";

        // Optional: inject a soft upsell in the assistant reply.
        // It will appear BEFORE the short story.
        storyUpsellMessage = "I can share a short story for you. Longer personalised narratives unlock with Pro and Elite.";
      }
    }

    const upgradeBlock = getUpgradeBlock(planTier, featureKey);
    if (upgradeBlock) {
      return { type: "upgrade_required", message: upgradeBlock };
    }

    const userId = memoryProfile?.userId ?? DEFAULT_MEMORY_PROFILE.userId;
    const tokenCost = 0;

    const aiContext =
      safeDailyContext || safeLongTermMemory || safeVoiceEmotion || personalityProfile
        ? {
            daily: safeDailyContext ?? null,
            memory: safeLongTermMemory ?? null,
            voiceEmotion: safeVoiceEmotion ?? null,
            personality: personalityProfile ?? null,
          }
        : undefined;

    const completion = await runFullAI({
      model: chosenModel,
      temperature: 0.4,
      system: combinedSystemPrompt,
      messages: userMessages,
      context: aiContext,
      tier: planTier,
      personality: personalityProfile ?? undefined,
    });

    const content = completion?.trim() || "";
    const userEmotion = allowTherapeutic ? emotionIntel?.emotion.primaryEmotion ?? "" : "";

    const fallbackResponses: Partial<Record<IntentType, string>> = {
      EMOTIONAL_SUPPORT:
        "I’m right here with you. What part of this feels heaviest to carry right now?",
      PHILOSOPHY: "Curious lens. What part of that question feels most alive for you?",
      META_REFLECTION: "Happy to talk about how I work—what would you like to know?",
      SMALLTALK: "Mostly floating in the cloud—what’s happening on your side?",
      PLAYFUL: "Plot twist: I was just thinking about you. What mischief are we up to?",
      UNKNOWN: "Hey, I’m here. What’s on your mind?",
    };

    const defaultFallback = "Just here in the cloud, ready for whatever you want to talk about.";
    let finalResponse = content || fallbackResponses[intent] || defaultFallback;

    const prefixes: string[] = [];

    if (allowTherapeutic) {
      const continuityLine =
        emotionIntel &&
        deriveEmotionalContinuity({
          sessionState: sessionState ?? null,
          emotionIntel: emotionIntel ?? null,
          tone: effectiveTone,
          memory: resolvedProfile,
        });

      const warmthSeed = `warmth-${sessionState?.totalTurns ?? 0}-${history.length}`;
      const warmthLine = stableChance(warmthSeed, 0.3)
        ? relationalWarmthLine(warmthSeed)
        : null;

      const microReward = generateMicroReward({
        latestUserMessage: anchoredUserMessage,
        tone: effectiveTone,
        sessionState: sessionState ?? null,
        emotionIntel: emotionIntel ?? null,
        memory: resolvedProfile,
      });

      const insightSeed = `insight-${sessionState?.phase}-${history.length}`;
      const conversationInsight = stableChance(insightSeed, 0.25)
        ? await pickInsightForConversation({ memory: resolvedProfile, realtime: realtimeBridge })
        : null;

      const attach = attachmentReflection(anchoredUserMessage);

      if (continuityLine) prefixes.push(continuityLine);
      if (warmthLine) prefixes.push(warmthLine);
      if (microReward) prefixes.push(microReward);
      if (conversationInsight) {
        const bridgeLine = "This also connects with one of the themes you've been moving through:";
        prefixes.push(`${bridgeLine}\n\n${conversationInsight.summary}`);
      }
      if (
        attach &&
        stableChance(
          `attach-${attach.length}-${sessionState?.turnsInPhase ?? 0}`,
          0.35,
        )
      ) {
        prefixes.push(attach);
      }
    }

    if (allowStoic) {
      const threadInfo = deriveCognitiveThread({
        history,
        sessionState: sessionState ?? null,
        emotionIntel: emotionIntel ?? null,
      });

      const threadReflection = generateCognitiveThreadReflection({
        coreThread: threadInfo.coreThread,
        underlyingTension: threadInfo.underlyingTension,
        emotionalDriver: threadInfo.emotionalDriver,
        tone: effectiveTone,
        sessionState: sessionState ?? null,
        memory: resolvedProfile,
      });

      if (threadReflection) {
        prefixes.push(threadReflection);
      }
    }

    if (prefixes.length > 0) {
      finalResponse = `${prefixes.join("\n\n")}\n\n${finalResponse}`;
    }

    if (allowTherapeutic) {
      const story = maybeUseMicroStory(userEmotion || anchoredUserMessage);
      if (
        story &&
        stableChance(`story-${story.length}-${finalResponse.length}`, 0.25)
      ) {
        finalResponse = `${finalResponse}\n\n${story}`;
      }

      const intervention = microIntervention(userEmotion || anchoredUserMessage);
      if (
        intervention &&
        stableChance(
          `intervention-${intervention.length}-${history.length}`,
          0.25,
        )
      ) {
        finalResponse = `${finalResponse}\n\n${intervention}`;
      }
    }

    // STORY MODE UPSELL MESSAGE (if set)
    if (storyUpsellMessage) {
      finalResponse = `${storyUpsellMessage}\n\n${finalResponse}`;
    }

    return { type: "ai_response", message: finalResponse };
  } catch (err) {
    console.error("runConversationalGuide error", err);
    throw err;
  }
}

function buildVoicePrompt(
  voiceContext: { emotion: VoiceEmotionSnapshot | null; intent: string | null } | null,
): string | null {
  if (!voiceContext || !voiceContext.emotion) return null;
  const emotionJson = JSON.stringify(voiceContext.emotion);
  const intentLabel = voiceContext.intent ?? "general";
  return [
    "VOICE INPUT DETECTED:",
    `- Emotion analysis: ${emotionJson}`,
    `- Detected intent: ${intentLabel}`,
    "Respond with:",
    "- Adaptive tone based on emotion cues.",
    "- Adjust warmth and clarity to match their tone.",
    "- Shorter replies when the user sounds stressed.",
    "- Slower emotional tempo when urgency feels high.",
  ].join("\n");
}

function buildConsistencyPrompt(consistency: ConsistencyContext | null): string | null {
  if (!consistency) return null;
  const historyJson = JSON.stringify(consistency.history ?? []);
  const arcJson = JSON.stringify(consistency.arc ?? {});
  return [
    "SHORT-TERM CONTEXT:",
    historyJson,
    "",
    "ACTIVE ARC:",
    arcJson,
    "",
    "Use these to maintain continuity, avoid contradictions, continue existing topics, and keep emotional tone stable.",
  ].join("\n");
}

function buildContextPrompt(
  tierBlock: string | null,
  longTermMemory: unknown,
  context: DailyContext | null,
): string {
  const trimmedTier = tierBlock?.trim();
  const memoryJson = JSON.stringify(longTermMemory ?? {});
  const contextJson = JSON.stringify(context ?? {});
  return [
    "You are Vella.",
    "Use DAILY CONTEXT and LONG-TERM MEMORY to guide your responses.",
    "LONG-TERM MEMORY:",
    memoryJson,
    trimmedTier && trimmedTier.length > 0 ? trimmedTier : null,
    "If a user asks emotional, behavioural, journaling, theme, pattern, distortion, loop, trait, goal, or growth-related questions, reference their real data carefully.",
    "DAILY CONTEXT:",
    contextJson,
  ]
    .filter((chunk) => chunk && `${chunk}`.trim().length > 0)
    .join("\n\n");
}

function sanitizeDailyContextForTier(
  tier: PlanTier,
  context: DailyContext | null,
): DailyContext | null {
  if (!context) return null;
  if (tier !== "free") return context;
  return {
    ...context,
    patterns: null,
    themes: [],
    loops: [],
    distortions: [],
    traits: null,
    goals: { life: [], focus: [] },
    forecast: null,
    growth: null,
    strategies: [],
  };
}

function sanitizeSnapshotForTier(tier: PlanTier, snapshot: unknown): unknown {
  if (tier !== "free" || !snapshot || typeof snapshot !== "object") {
    return snapshot;
  }
  const clone: Record<string, unknown> = { ...(snapshot as Record<string, unknown>) };
  delete clone.patterns;
  delete clone.themes;
  delete clone.loops;
  delete clone.distortions;
  delete clone.traits;
  delete clone.goals;
  return clone;
}

type RealtimeBridgeOptions = {
  realtime: InsightRealtimeContext | null;
  personaVoiceId: VellaVoiceId;
  personaMoodState: MoodState;
  responseLanguage: SupportedLanguageCode;
  personaSettingsSnapshot: VellaSettings;
  memoryProfile: MemoryProfile;
};

function buildRealtimeBridgePayload({
  realtime,
  personaVoiceId,
  personaMoodState,
  responseLanguage,
  personaSettingsSnapshot,
  memoryProfile,
}: RealtimeBridgeOptions): RealtimeDeliveryMeta | null {
  const behaviourVector = realtime?.behaviourVector ?? memoryProfile.behaviourVector ?? null;
  const monitoring = realtime?.monitoring ?? undefined;
  const emotionalState = realtime?.emotionalState ?? undefined;
  const realtimeInsights = normalizeRealtimeInsightPayload(realtime?.insights);
  const insights = realtimeInsights ?? extractInsightsFromMemory(memoryProfile);
  const language =
    (realtime?.language ?? responseLanguage) as SupportedLanguage;

  const hasRealtimeSignal =
    Boolean(realtime) ||
    Boolean(behaviourVector) ||
    Boolean(monitoring) ||
    Boolean(emotionalState) ||
    Boolean(insights);

  if (!hasRealtimeSignal) {
    return null;
  }

  const resolvedVoiceId =
    normalizeVellaVoiceId(realtime?.voiceId ?? personaVoiceId) ?? personaVoiceId;

  return {
    voiceId: resolvedVoiceId,
    moodState: realtime?.moodState ?? personaMoodState,
    language,
    behaviourVector,
    monitoring,
    emotionalState,
    insights: insights ?? undefined,
    healthState: realtime?.healthState ?? undefined,
    responsePlan: normalizeResponsePlanPayload(realtime?.responsePlan) ?? null,
  };
}

function extractInsightsFromMemory(memory: MemoryProfile): SanitizedRealtimeInsight[] | null {
  const memoryInsights =
    memory.insights && "patterns" in memory.insights && Array.isArray(memory.insights.patterns)
      ? memory.insights.patterns
      : [];

  if (!memoryInsights.length) {
    return null;
  }

  return memoryInsights.slice(0, 3).map((pattern) => ({
    title: (pattern.label ?? "Insight").trim() || "Insight",
    summary: (pattern.description ?? "").trim(),
  }));
}

function relationalWarmthLine(seed: string) {
  const lines = [
    "I hear you.",
    "That makes sense.",
    "It’s understandable you’d feel that.",
    "This sounds like a lot to carry.",
    "Many people feel something similar in moments like this.",
  ];
  return pickDeterministic(lines, seed);
}

function findMostRecentUserTurn(history: ConversationTurn[]): ConversationTurn | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role === "user") {
      return turn;
    }
  }
  return null;
}

function maybeUseMicroStory(emotion: string): string | null {
  if (!emotion) return null;
  const lower = emotion.toLowerCase();
  const pick = microStories.find((story) => lower.includes(story.theme));
  return pick ? pick.text : null;
}

function mapAbsenceTone(persona: VellaPersonaMode, tone: TonePreference): string {
  if (persona === "warm_playful") {
    return "playful";
  }
  switch (tone) {
    case "soft":
      return "soft";
    case "direct":
      return "direct";
    case "stoic":
      return "stoic";
    case "warm":
      return "warm";
    default:
      return "neutral";
  }
}

function clamp01(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function determineFeatureKey(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  if (
    msg.includes("long story") ||
    msg.includes("very long") ||
    msg.includes("extended story") ||
    msg.includes("multi chapter") ||
    msg.includes("multi-chapter")
  ) {
    return "story_long";
  }

  if (
    msg.includes("story") ||
    msg.includes("short story") ||
    msg.includes("tell me a story") ||
    msg.includes("write me a story") ||
    msg.includes("make a story") ||
    msg.includes("fairytale") ||
    msg.includes("fairy tale")
  ) {
    return "story_short";
  }

  if (
    msg.includes("voice") &&
    (msg.includes("call") || msg.includes("talk") || msg.includes("speak"))
  ) {
    if (msg.includes("long") || msg.includes("extended")) {
      return "voice_long";
    }
    return "voice_quick";
  }

  if (
    msg.includes("deep") ||
    msg.includes("break this down") ||
    msg.includes("analyse me") ||
    msg.includes("analyze me") ||
    msg.includes("help me understand") ||
    msg.includes("emotional") ||
    msg.includes("can you go deeper")
  ) {
    return "deep_emotion";
  }

  if (
    msg.includes("long advice") ||
    msg.includes("detailed advice") ||
    msg.includes("full explanation") ||
    msg.includes("explain in detail")
  ) {
    return "long_advice";
  }

  if (
    msg.includes("check in") ||
    msg.includes("check-in") ||
    msg.includes("mood check") ||
    msg.includes("daily check")
  ) {
    return "checkin";
  }

  if (msg.includes("journal") || msg.includes("journaling")) {
    return "journal";
  }

  if (msg.includes("insight") || msg.includes("give me insight")) {
    return "insight";
  }

  if (msg.length > 200) {
    return "text_long";
  }

  return "text_short";
}