/**
 * Intent Router
 * Engine-first routing for Vella text interactions.
 * Conservative: when uncertain, route to engine.
 */

import type { CreditTier } from "@/lib/billing/creditCostTable";

export type RouterResult =
  | { mode: "engine"; tier: null }
  | { mode: "ai"; tier: CreditTier }
  | { mode: "greeting_template"; tier: null };

// Greeting keywords - short, social openers
const GREETING_KEYWORDS = [
  "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
  "how are you", "what's up", "sup", "yo", "greetings",
];

// Exact-match greeting whitelist (normalised to lowercase, trimmed)
// ONLY pure greetings with zero semantic content.
const GREETING_WHITELIST = new Set([
  "hi", "hello", "hey", "yo", "sup", "hii", "hiii",
  "hi there", "hey there", "hello there", "hello vella", "hi vella", "hey vella",
]);

// Greeting-only tokens: words that carry no semantic intent on their own.
// Used for stripping: if ALL words are in this set, it's a pure greeting.
const GREETING_ONLY_TOKENS = new Set([
  "hi", "hello", "hey", "yo", "sup", "hii", "hiii",
  "there", "vella", "greetings",
  "good", "morning", "afternoon", "evening",
]);

/**
 * Strict greeting / acknowledgement matcher.
 * Returns true ONLY for messages that are pure greetings with no semantic content.
 * "hi" → true, "hi there" → true, "hi I feel stuck" → false.
 */
export function isGreetingMatch(text: string): boolean {
  const normalised = text.toLowerCase().trim().replace(/[!.,?]+$/g, "");
  // 1. Exact whitelist match (pure greetings only)
  if (GREETING_WHITELIST.has(normalised)) return true;
  // 2. Word-stripping: remove all greeting-only tokens, check if semantic words remain
  const words = normalised.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return false;
  if (words.length > 4) return false; // Anything > 4 words is never a pure greeting
  const remainingWords = words.filter(w => !GREETING_ONLY_TOKENS.has(w));
  // If every word is a greeting token → pure greeting
  if (remainingWords.length === 0) return true;
  // Any non-greeting word remains → NOT a greeting
  return false;
}

// Single emotion indicators - short emotional states
const EMOTION_WORDS = [
  "sad", "happy", "angry", "anxious", "worried", "stressed", "tired",
  "excited", "grateful", "lonely", "overwhelmed", "frustrated", "confused",
  "disappointed", "hopeful", "scared", "nervous", "peaceful", "content",
];

// Reasoning verbs — if present with < 10 words, still route to AI
const REASONING_VERBS = [
  "explain", "analyze", "analyse", "compare", "evaluate", "help me understand",
  "break down", "breakdown", "what should", "how do i", "why do",
];

// Deep-tier keywords: planning / strategy / framework
const DEEP_KEYWORDS = [
  "plan", "roadmap", "strategy", "analyse", "analyze", "breakdown",
  "break down", "compare", "build", "framework", "5-year", "10-year",
  "life plan", "career plan", "long term", "life architecture",
  "blueprint", "masterplan", "vision", "mission", "goal setting",
];

// Complex-tier keywords: reasoning but not planning
const COMPLEX_KEYWORDS = [
  "evaluate", "assessment", "review", "examine", "deconstruct",
  "contrast", "pros and cons", "trade-off", "dilemma", "decision",
  "weigh", "consider",
];

/**
 * Detect if message is primarily a greeting.
 * Uses word-boundary regex to avoid substring false positives
 * (e.g. "this" no longer matches "hi").
 */
function isGreeting(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (lower.length >= 30) return false;
  return GREETING_KEYWORDS.some((g) => {
    const pattern = new RegExp(`\\b${g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    return pattern.test(lower);
  });
}

/**
 * Detect if message is a single emotion statement.
 * "I feel sad", "anxious", "feeling overwhelmed"
 */
function isSingleEmotion(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/);

  if (words.length <= 3) {
    return EMOTION_WORDS.some((e) => lower.includes(e));
  }

  if (words.length <= 5 && lower.includes("feeling")) {
    return EMOTION_WORDS.some((e) => lower.includes(e));
  }

  return false;
}

/**
 * Check if message contains reasoning verbs.
 */
function hasReasoningVerbs(text: string): boolean {
  const lower = text.toLowerCase();
  return REASONING_VERBS.some((v) => lower.includes(v));
}

/**
 * Detect deep-tier intent (planning/strategy/framework).
 */
function hasDeepIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return DEEP_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Detect complex-tier intent (reasoning but not planning).
 */
function hasComplexIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return COMPLEX_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Check if message is multi-paragraph (> 1 newline-separated block).
 */
function isMultiParagraph(text: string): boolean {
  const blocks = text.split(/\n/).filter((line) => line.trim().length > 0);
  return blocks.length > 1;
}

/**
 * Route message to engine or AI tier.
 * Conservative: uncertain → engine.
 */
export interface RouterContext {
  /** True when there are no prior assistant turns in the session */
  isFirstMessage: boolean;
  /** Number of messages in conversationHistory (used for session depth guard) */
  sessionHistoryLength?: number;
}

export interface RouterTrace {
  result: RouterResult;
  reason: string;
  rules_triggered: string[];
  word_count: number;
  char_count: number;
  is_first_message: boolean;
  greeting_matched: boolean;
}

export function routeIntent(message: string, ctx?: RouterContext): RouterResult {
  return routeIntentWithTrace(message, ctx).result;
}

export function routeIntentWithTrace(message: string, ctx?: RouterContext): RouterTrace {
  const trimmed = message.trim();
  const wordCount = trimmed.split(/\s+/).length;
  const charCount = trimmed.length;
  const rules: string[] = [];
  const isFirst = ctx?.isFirstMessage ?? false;
  const greetingMatched = isGreetingMatch(trimmed);

  // ── Policy A: First message in session → always AI (simple) ──
  if (isFirst) {
    rules.push("policy_first_message_ai");
    // Still choose tier based on content complexity
    const tier = determineTier(trimmed, wordCount, rules);
    return {
      result: { mode: "ai", tier },
      reason: "first_message_ai",
      rules_triggered: rules,
      word_count: wordCount,
      char_count: charCount,
      is_first_message: true,
      greeting_matched: greetingMatched,
    };
  }

  // ── Policy B: Greeting/acknowledgement in existing session → template ──
  // Session depth guard: if >= 3 messages in history, route to AI for continuity
  const sessionDepth = ctx?.sessionHistoryLength ?? 0;
  if (greetingMatched && sessionDepth < 3) {
    rules.push("policy_greeting_template");
    console.log("[ROUTER_DIAG] greeting_template triggered", {
      original: message,
      normalised: trimmed.toLowerCase().trim(),
      wordCount,
      sessionDepth,
      rule: "policy_greeting_template",
    });
    return {
      result: { mode: "greeting_template", tier: null },
      reason: "greeting_template",
      rules_triggered: rules,
      word_count: wordCount,
      char_count: charCount,
      is_first_message: false,
      greeting_matched: true,
    };
  }
  if (greetingMatched && sessionDepth >= 3) {
    rules.push("policy_greeting_session_depth_override");
    console.log("[ROUTER_DIAG] greeting_template BLOCKED by session depth", {
      original: message,
      sessionDepth,
      rule: "policy_greeting_session_depth_override",
    });
  }

  // ── Policy C: Single emotion statement (short) → AI simple ──
  if (isSingleEmotion(trimmed)) {
    rules.push("emotion_ai_simple");
    return {
      result: { mode: "ai", tier: "simple" },
      reason: "ai_default",
      rules_triggered: rules,
      word_count: wordCount,
      char_count: charCount,
      is_first_message: false,
      greeting_matched: false,
    };
  }

  // ── Policy D: Default AI mode — choose tier by content ──
  const tier = determineTier(trimmed, wordCount, rules);
  return {
    result: { mode: "ai", tier },
    reason: "ai_default",
    rules_triggered: rules,
    word_count: wordCount,
    char_count: charCount,
    is_first_message: false,
    greeting_matched: false,
  };
}

/**
 * Determine credit tier from message content.
 * Extracted so both first-message and default paths share the same logic.
 */
function determineTier(trimmed: string, wordCount: number, rules: string[]): CreditTier {
  if (hasDeepIntent(trimmed)) {
    rules.push("tier_deep_keywords");
    return "deep";
  }
  if (isMultiParagraph(trimmed)) rules.push("tier_multi_paragraph");
  if (hasComplexIntent(trimmed)) rules.push("tier_complex_keywords");
  if (rules.some(r => r.startsWith("tier_"))) {
    return "complex";
  }
  if (hasReasoningVerbs(trimmed)) {
    rules.push("tier_reasoning_verbs");
    return "simple";
  }
  rules.push("tier_default_simple");
  return "simple";
}

/**
 * Log router decision. Required structured format.
 */
export function logRouterDecision(message: string, result: RouterResult): void {
  const wordCount = message.trim().split(/\s+/).length;
  console.log("[ROUTER]", {
    route: "vella_text",
    mode: result.mode,
    tier: result.tier,
    wordCount,
  });
}
