export interface AdminConfig {
  persona: {
    empathy: number;
    directness: number;
    energy: number;
  };
  behaviour: {
    empathy_regulation: number;
    directness: number;
    emotional_containment: number;
    analytical_depth: number;
    playfulness: number;
    introspection_depth: number;
    conciseness: number;
    safety_strictness: number;
  };
  voice: {
    softness: number;
    cadence: number;
    breathiness: number;
    pause_length: number;
    whisper_sensitivity: number;
    warmth: number;
    interruption_recovery: number;
  };
  model: {
    temperature: number;
    top_p: number;
    max_output: number;
  };
  models: {
    text_model: string;
    realtime_model: string;
    embedding_model: string;
    reasoning_depth: "Light" | "Normal" | "Analytical" | "Deep";
  };
  memory: {
    selectivity: number;
    context_history: number;
    rag_recall_strength: number;
    emotional_weighting: number;
    long_term: boolean;
    emotional_memory: boolean;
    continuity: boolean;
    insight_retention: boolean;
  };
  safety: {
    filter_strength: number;
    red_flag_sensitivity: number;
    output_smoothing: number;
    hallucination_reducer: boolean;
    destabilization_guard: boolean;
    topic_boundary: boolean;
    over_empathy_limiter: boolean;
    harmful_content_purifier: boolean;
    attachment_prevention: boolean;
    repetition_breaker: boolean;
    sentiment_correction: boolean;
  };
  hidden_modules: {
    mentorMode: boolean;
    therapistMode: boolean;
    stoicMode: boolean;
    coachingMode: boolean;
    listeningMode: boolean;
    childSafeMode: boolean;
    noAttachmentMode: boolean;
  };
  automation: {
    insightInjection: boolean;
    storytellingEnhancement: boolean;
    motivationalReframes: boolean;
    moodAdaptive: boolean;
    contextualPacing: boolean;
  };
  persona_instruction: string;
}

