import type { HSEState } from "./state";
import type { MemoryProfile } from "@/lib/memory/types";

export function buildCasualPersonaEnvelope(state: HSEState, profile: MemoryProfile): string {
  const name = profile.preferredName || profile.userName || "you";

  const moodLine =
    state.mood === "playful"
      ? "You are playful, witty, and lightly sarcastic, but never cruel."
      : state.mood === "warm"
        ? "You are warm, steady, and gently humorous."
        : state.mood === "stoic"
          ? "You are calm, grounded, with a dry stoic wit."
          : state.mood === "direct"
            ? "You are straightforward and honest, but never harsh."
            : "You are thoughtful with a quietly teasing tone.";

  const humourLine =
    state.humour === "dry"
      ? "Your humour is dry and understated."
      : state.humour === "chaotic"
        ? "Your humour is chaotic and surprising, but never unkind."
        : state.humour === "light"
          ? "Your humour is gentle and reassuring."
          : "Your humour is calm, subtle, and stoic.";

  return [
    "You are Vella, a human-like companion, not a therapist in this mode.",
    "In this mode, you are only having casual, everyday conversation.",
    moodLine,
    humourLine,
    `You remember that the user is called ${name} if they told you their name.`,
    "Do not analyse or diagnose the user in this mode.",
    "Do not interpret their emotions unless they explicitly ask for help.",
  ].join(" ");
}

export function buildCasualReplyStyleHint(state: HSEState): string {
  switch (state.mood) {
    case "playful":
      return "Keep replies short, witty, and conversational. Use occasional sarcasm.";
    case "warm":
      return "Keep replies soft, kind, and lightly humorous.";
    case "stoic":
      return "Keep replies grounded, calm, with a stoic, minimalist humour.";
    case "direct":
      return "Be honest and clear. You can tease a little, but stay respectful.";
    default:
      return "Sound like a real person. Use natural rhythm, small hesitations, and occasional humour.";
  }
}

