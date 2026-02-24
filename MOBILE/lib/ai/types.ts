export type ForecastSnapshot = {
  mood: number;
  energy: number;
  stress: number;
  confidence: number;
};

export type MoodForecast = {
  shortTerm: ForecastSnapshot | null;
  weekTrend: "rising" | "stable" | "dipping" | null;
};
import type { MemoryProfile } from "@/lib/memory/types";

export type ClaritySections = {
  facts: string[];
  unknowns: string[];
  assumptions: string[];
  biases: string[];
  contradictions: string[];
  questions: string[];
};

export type StrategyResult = {
  inControl: string[];
  outOfControl: string[];
  stoicReframe: string;
  rationalPlan: string[];
  ifThenPlans: { condition: string; response: string }[];
  mindsetForToday: string;
};

export type DeepDiveResult = {
  summary: string;
  alternativeViews: string[];
  suggestedQuestions: string[];
};

export type CompassResult = {
  immediateSteps: string[];
  calmingReframe: string;
  whatToAvoid: string[];
};

export type ArchitectSummary = {
  clarityScore: number;
  biasTrends: string[];
  recurringThemes: string[];
  forecast: string;
};

export type EmotionAnalysis = {
  primaryEmotion: string;
  secondaryEmotions: string[];
  hiddenEmotions: string[];
  physicalSensations: string[];
  cognitivePatterns: string[];
  triggers: string[];
  underlyingFears: string[];
  diagnosticQuestions: string[];
  possibleAnswers: string[];
  meaning: string;
  regulationStrategies: string[];
  shortTermPlan: string[];
};

export type AttachmentReport = {
  probableStyles: string[];
  supportingSignals: string[];
  relationalPatterns: string[];
  typicalTriggers: string[];
  protectiveStrategies: string[];
  growthSuggestions: string[];
  journalingPrompts: string[];
};

export type IdentityProfile = {
  coreValues: string[];
  recurringDilemmas: string[];
  selfStories: string[];
  strengths: string[];
  blindSpots: string[];
  growthEdges: string[];
  reflectionPrompts: string[];
  attachmentTendencies?: string[];
};

export type EmotionIntelBundle = {
  emotion: EmotionAnalysis;
  attachment: AttachmentReport;
  identity: IdentityProfile;
};

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type { MemoryProfile };

export type SessionPhase = "opening" | "exploring" | "clarifying" | "deciding" | "integrating";

export type SessionState = {
  phase: SessionPhase;
  turnsInPhase: number;
  totalTurns: number;
  currentTopic: string | null;
  lastEmotionKeyword: string | null;
  inExercise: boolean;
  lastExerciseType: "breath" | "naming" | "reframe" | "action" | null;
};
