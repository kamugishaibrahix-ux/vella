/**
 * Deterministic Fallback Intelligence (Mode B)
 *
 * Provides structured, empathetic responses when AI credits are exhausted.
 * No external AI calls. Uses keyword analysis + structured templates.
 *
 * Constraints:
 * - Max 200–300 words per response
 * - No chain-of-thought or recursive reasoning
 * - Maintains Vella voice (warm, direct, grounded)
 * - Slightly reduced depth compared to full AI
 */

// ── Emotion Detection ─────────────────────────────────────────────────────────

const EMOTION_PATTERNS: { emotion: string; keywords: RegExp }[] = [
  { emotion: "anxious", keywords: /\b(anxi|worry|worrie|nervous|panic|scared|fear|dread|overwhelm|stress|tense)\w*/i },
  { emotion: "sad", keywords: /\b(sad|depress|down|hopeless|empty|lonely|grief|loss|hurt|crying|tears)\w*/i },
  { emotion: "angry", keywords: /\b(angry|furious|rage|frustrat|annoy|irrit|mad|resent|bitter|hate)\w*/i },
  { emotion: "stuck", keywords: /\b(stuck|lost|confus|uncertain|unsure|indecis|don'?t know|no idea|can'?t decide)\w*/i },
  { emotion: "tired", keywords: /\b(tired|exhaust|burnout|burnt out|drain|fatigue|worn out|no energy|sleep)\w*/i },
  { emotion: "motivated", keywords: /\b(motivat|excit|inspir|ready|determined|goal|commit|start|begin|change)\w*/i },
  { emotion: "grateful", keywords: /\b(grateful|thankful|appreciat|blessed|glad|happy|joy|content|peace)\w*/i },
];

function extractEmotion(text: string): string {
  for (const { emotion, keywords } of EMOTION_PATTERNS) {
    if (keywords.test(text)) return emotion;
  }
  return "neutral";
}

// ── Structured Reflection ─────────────────────────────────────────────────────

const REFLECTIONS: Record<string, string[]> = {
  anxious: [
    "It sounds like you're carrying a lot of weight right now. That takes real energy.",
    "When anxiety shows up, it often means something important is at stake for you.",
    "Your mind is working hard to protect you — even when it feels overwhelming.",
  ],
  sad: [
    "What you're feeling matters, and it's okay to sit with it for a moment.",
    "Sadness often points to something you care deeply about.",
    "You don't have to rush through this. Some feelings need space.",
  ],
  angry: [
    "That frustration is telling you something worth listening to.",
    "Anger often shows up when a boundary has been crossed or a need isn't being met.",
    "It makes sense that you'd feel this way given what you're going through.",
  ],
  stuck: [
    "Feeling stuck can be its own kind of clarity — it means you're ready for something to shift.",
    "You don't need the full picture right now. Just the next small step.",
    "Sometimes the best move when you feel stuck is to name exactly what's holding you.",
  ],
  tired: [
    "Your body and mind are telling you something important right now.",
    "Rest isn't giving up — it's how you protect what matters most.",
    "When everything feels heavy, sometimes the most powerful thing is to pause.",
  ],
  motivated: [
    "That energy you're feeling is worth channeling into something concrete.",
    "Motivation is a signal — let's make sure it lands somewhere real.",
    "This is a good moment to name one specific thing you want to move forward.",
  ],
  grateful: [
    "Noticing what's good is a real strength, especially when things aren't perfect.",
    "Gratitude doesn't erase difficulty — it just gives you a wider view.",
    "Holding both the hard and the good takes real awareness.",
  ],
  neutral: [
    "I hear you. Let's take a closer look at what's on your mind.",
    "Thanks for sharing that. There's usually more underneath the surface.",
    "Let's slow down and see what's really at the center of this for you.",
  ],
};

function generateStructuredReflection(emotion: string): string {
  const options = REFLECTIONS[emotion] ?? REFLECTIONS.neutral;
  // Deterministic selection based on current minute (varies but is reproducible within the same minute)
  const index = new Date().getMinutes() % options.length;
  return options[index];
}

// ── Action Steps ──────────────────────────────────────────────────────────────

const ACTION_STEPS: Record<string, string[]> = {
  anxious: [
    "Try naming three things you can see right now — it can help ground you in the present.",
    "One small thing: take a slow breath, hold for four counts, and release for six.",
    "Write down the single biggest worry. Sometimes seeing it on paper reduces its power.",
  ],
  sad: [
    "If you can, do one kind thing for yourself today — even something small counts.",
    "Try putting words to what you've lost or what feels missing. That's not weakness; it's honesty.",
    "Reach out to someone you trust, even if it's just to say you're having a hard day.",
  ],
  angry: [
    "Before reacting, try naming the need behind the anger: what do you actually want here?",
    "Movement can help — a short walk or even clenching and releasing your fists.",
    "Write down what happened and what you wish had happened instead.",
  ],
  stuck: [
    "Pick the smallest possible next step — not the right one, just a real one.",
    "Try finishing this sentence: 'If I knew I couldn't fail, I would...'",
    "Ask yourself: what am I afraid will happen if I choose wrong?",
  ],
  tired: [
    "Give yourself permission to do less today. Protect your energy for what matters most.",
    "Check the basics: water, food, fresh air, sleep. Start with whichever one you've skipped.",
    "Set one boundary today — say no to one thing that's draining you.",
  ],
  motivated: [
    "Pick one specific action you can take in the next 24 hours.",
    "Write down your goal and the first three steps. Keep it concrete.",
    "Tell someone about your intention — accountability makes it real.",
  ],
  grateful: [
    "Take a moment to write down what you noticed. Gratitude deepens when you name it.",
    "Consider sharing this with someone — it multiplies the feeling.",
    "Build on this: what's one thing you want to carry forward from today?",
  ],
  neutral: [
    "Take a moment to check in with yourself: what do you need most right now?",
    "Try finishing this sentence: 'Right now, the thing that matters most is...'",
    "If nothing feels urgent, that can be a good sign. What would you like to explore?",
  ],
};

function generateActionStep(emotion: string): string {
  const options = ACTION_STEPS[emotion] ?? ACTION_STEPS.neutral;
  const index = new Date().getMinutes() % options.length;
  return options[index];
}

// ── Response Composition ──────────────────────────────────────────────────────

interface DeterministicFallbackInput {
  text: string;
  userId: string;
  mode?: "low_depth" | "minimal";
}

/**
 * Build a deterministic fallback response.
 * No external AI calls. Template-based with emotional awareness.
 *
 * @returns A complete response string (200–300 words max)
 */
export async function buildDeterministicFallback(
  input: DeterministicFallbackInput
): Promise<string> {
  const { text } = input;

  const emotion = extractEmotion(text);
  const reflection = generateStructuredReflection(emotion);
  const action = generateActionStep(emotion);

  // Compose in Vella voice: reflection → validation → action
  const parts = [
    reflection,
    "",
    action,
  ];

  return parts.join("\n\n").trim();
}
