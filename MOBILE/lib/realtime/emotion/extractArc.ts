// Lightweight emotional-arc extractor for realtime voice tuning.

export interface EmotionalArc {
  sentiment: "positive" | "neutral" | "negative";
  intensity: number;
  arc: "rise" | "peak" | "fall" | "resolution";
}

export function extractEmotionalArc(text: string): EmotionalArc {
  if (!text || typeof text !== "string") {
    return { sentiment: "neutral", intensity: 0, arc: "resolution" };
  }

  const lower = text.toLowerCase();

  let sentiment: EmotionalArc["sentiment"] = "neutral";
  let intensity = 0;

  if (/\b(amazing|love|great|excited|wonderful|happy|beautiful)\b/.test(lower)) {
    sentiment = "positive";
    intensity = 0.6;
  }
  if (/\b(sad|hurt|scared|upset|alone|anxious|stress|pain)\b/.test(lower)) {
    sentiment = "negative";
    intensity = 0.7;
  }

  let arc: EmotionalArc["arc"] = "resolution";
  if (intensity >= 0.6 && sentiment === "positive") arc = "rise";
  if (intensity >= 0.7 && sentiment === "negative") arc = "peak";
  if (sentiment === "negative" && intensity < 0.5) arc = "fall";

  return { sentiment, intensity, arc };
}

