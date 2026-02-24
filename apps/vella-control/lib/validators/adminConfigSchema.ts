import { z } from "zod";

export const reasoningDepthEnum = z.enum(["Light", "Normal", "Analytical", "Deep"]);

export const adminConfigSchema = z.object({
  persona: z.object({
    empathy: z.number().min(0).max(100),
    directness: z.number().min(0).max(100),
    energy: z.number().min(0).max(100),
  }),
  behaviour: z.object({
    empathy_regulation: z.number().min(0).max(100),
    directness: z.number().min(0).max(100),
    emotional_containment: z.number().min(0).max(100),
    analytical_depth: z.number().min(0).max(100),
    playfulness: z.number().min(0).max(100),
    introspection_depth: z.number().min(0).max(100),
    conciseness: z.number().min(0).max(100),
    safety_strictness: z.number().min(0).max(100),
  }),
  voice: z.object({
    softness: z.number().min(0).max(100),
    cadence: z.number().min(0).max(100),
    breathiness: z.number().min(0).max(100),
    pause_length: z.number().min(0).max(100),
    whisper_sensitivity: z.number().min(0).max(100),
    warmth: z.number().min(0).max(100),
    interruption_recovery: z.number().min(0).max(100),
  }),
  model: z.object({
    temperature: z.number().min(0).max(2),
    top_p: z.number().min(0).max(1),
    max_output: z.number().min(200).max(4000),
  }),
  models: z.object({
    text_model: z.string(),
    realtime_model: z.string(),
    embedding_model: z.string(),
    reasoning_depth: reasoningDepthEnum,
  }),
  memory: z.object({
    selectivity: z.number().min(0).max(100),
    context_history: z.number().min(4).max(50),
    rag_recall_strength: z.number().min(0).max(100),
    emotional_weighting: z.number().min(0).max(100),
    long_term: z.boolean(),
    emotional_memory: z.boolean(),
    continuity: z.boolean(),
    insight_retention: z.boolean(),
  }),
  safety: z.object({
    filter_strength: z.number().min(0).max(100),
    red_flag_sensitivity: z.number().min(0).max(100),
    output_smoothing: z.number().min(0).max(100),
    hallucination_reducer: z.boolean(),
    destabilization_guard: z.boolean(),
    topic_boundary: z.boolean(),
    over_empathy_limiter: z.boolean(),
    harmful_content_purifier: z.boolean(),
    attachment_prevention: z.boolean(),
    repetition_breaker: z.boolean(),
    sentiment_correction: z.boolean(),
  }),
  hidden_modules: z.object({
    mentorMode: z.boolean(),
    therapistMode: z.boolean(),
    stoicMode: z.boolean(),
    coachingMode: z.boolean(),
    listeningMode: z.boolean(),
    childSafeMode: z.boolean(),
    noAttachmentMode: z.boolean(),
  }),
  automation: z.object({
    insightInjection: z.boolean(),
    storytellingEnhancement: z.boolean(),
    motivationalReframes: z.boolean(),
    moodAdaptive: z.boolean(),
    contextualPacing: z.boolean(),
  }),
  persona_instruction: z.string(),
});

export type AdminConfigInput = z.infer<typeof adminConfigSchema>;

