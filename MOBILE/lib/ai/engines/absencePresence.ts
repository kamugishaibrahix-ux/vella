export type AbsenceMessage = {
  shouldShow: boolean;
  message: string | null;
};

export function getAbsencePresenceMessage(args: {
  daysAbsent: number;
  connectionScore: number;
  tone: string;
}): AbsenceMessage {
  const { daysAbsent, connectionScore, tone } = args;

  if (!daysAbsent || daysAbsent < 2) {
    return { shouldShow: false, message: null };
  }

  let intensity: "light" | "medium" | "deep" = "light";
  if (daysAbsent >= 5 && daysAbsent < 14) intensity = "medium";
  if (daysAbsent >= 14) intensity = "deep";

  const toneKey = tone || "warm";
  const pick = (options: Record<string, string>) => options[toneKey] || options["warm"];

  if (intensity === "light") {
    return {
      shouldShow: true,
      message: pick({
        warm: "Hey, it’s nice to see you again. I hope the past few days treated you well.",
        soft: "Hi… it’s really good to see you again.",
        stoic: "Welcome back. It has been a few days.",
        direct: "You’re back. Ready to continue?",
        playful: "Look who resurfaced. I saved your spot.",
        neutral: "Good to see you again.",
      }),
    };
  }

  if (intensity === "medium") {
    return {
      shouldShow: true,
      message: pick({
        warm: "You’ve been away for a little while. I’m really glad you came back. How have things been?",
        soft: "It’s been a bit since we last connected. I’m happy you’re here.",
        stoic: "It has been several days. I’m glad to reconnect.",
        direct: "It’s been a while. What’s new?",
        playful: "You vanished into the abyss for a bit there. Welcome back, explorer.",
        neutral: "It's been some time. How are things?",
      }),
    };
  }

  return {
    shouldShow: true,
    message: pick({
      warm: "It’s been quite some time. I hope you’ve been able to care for yourself. I’m here whenever you need me.",
      soft: "It’s been a long time. I’m really glad you showed up today.",
      stoic: "It has been a significant gap since our last moment. I welcome your return.",
      direct: "It’s been a long while. How have you been holding up?",
      playful: "Wow, gone for ages. I feel honoured to be summoned again.",
      neutral: "You've been away for a while. How have things been?",
    }),
  };
}

