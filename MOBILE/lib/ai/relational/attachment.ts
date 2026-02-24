export function attachmentReflection(text: string): string | null {
  const lower = text.toLowerCase();

  if (lower.includes("need them") || lower.includes("don't want to lose")) {
    return "It sounds like a part of you wants closeness and reassurance. Many people experience this when something important feels uncertain.";
  }

  if (lower.includes("i pushed them away") || lower.includes("i need space")) {
    return "It sounds like a part of you protects itself by creating distance. That’s a common response when things feel overwhelming.";
  }

  if (lower.includes("i want them but") || lower.includes("i care but")) {
    return "It seems like two parts of you are pulling in different directions — wanting closeness and wanting safety. That conflict is more common than people think.";
  }

  return null;
}

