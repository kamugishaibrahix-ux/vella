const WELCOME_MESSAGES = [
  "I’m here with you. What’s on your mind today?",
  "Hi, I’m glad you’re here. How are you feeling right now?",
  "Welcome back. What’s been weighing on your heart lately?",
  "I’m here — tell me what you’d like to talk about.",
  "It's good to see you. How are you doing today?",
] as const;

export function getWelcomeMessage() {
  const now = new Date();
  const seed = now.getUTCDate() + now.getUTCHours();
  const index = Math.abs(seed) % WELCOME_MESSAGES.length;
  return WELCOME_MESSAGES[index]!;
}


