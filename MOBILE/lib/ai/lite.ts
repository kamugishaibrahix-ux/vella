import type { VellaPersonaMode } from "@/lib/ai/agents";

export async function generateLiteResponse(
  prompt: string,
  persona: VellaPersonaMode = "soft_calm",
): Promise<string> {
  const msg = prompt.toLowerCase();

  if (persona === "warm_playful") {
    if (msg.includes("sad") || msg.includes("heavy")) {
      return "That does sound heavy, but I’m really glad you’re sharing it with me. Want to unpack it together a bit?";
    }
    if (msg.includes("excited") || msg.includes("good news")) {
      return "I’m buzzing with you. Tell me all the details so we can enjoy this properly.";
    }
    return "I’m here with you. Tell me a little more about what’s going on in your world today.";
  }

  if (persona === "stoic_coach") {
    if (msg.includes("stuck") || msg.includes("lost")) {
      return "I hear you. Let’s slow this down a little. What’s the clearest way you’d describe what you’re feeling right now?";
    }
    return "I’m listening. What feels most important to make sense of in this moment?";
  }

  if (msg.includes("anxious") || msg.includes("worried")) {
    return "It makes sense to feel that way. Let’s take it one step at a time. What’s been sitting on your mind most today?";
  }

  if (msg.includes("sad") || msg.includes("upset")) {
    return "I’m here with you. Want to tell me what made you feel this way?";
  }

  if (msg.includes("lonely")) {
    return "I’m right here with you. What part of today felt the hardest?";
  }

  return "I’m still with you, even without tokens. What feels most important to talk about right now?";
}
