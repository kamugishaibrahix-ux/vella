export interface EmotionalContinuity {
  lastEmotion: string;
  dominantEmotion: string;
  stability: number;
}

export const DEFAULT_ECS: EmotionalContinuity = {
  lastEmotion: "neutral",
  dominantEmotion: "neutral",
  stability: 0.5,
};

export function loadECS(): EmotionalContinuity {
  try {
    const data = localStorage.getItem("vella_ecs");
    if (!data) return DEFAULT_ECS;
    return { ...DEFAULT_ECS, ...JSON.parse(data) };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[persona/emotionalContinuity] persistence failed:", err);
    }
    return DEFAULT_ECS;
  }
}

export function saveECS(state: EmotionalContinuity) {
  try {
    localStorage.setItem("vella_ecs", JSON.stringify(state));
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[persona/emotionalContinuity] persistence failed:", err);
    }
  }
}

