export type ExerciseType =
  | "breathing"
  | "grounding"
  | "mindfulness"
  | "stressReset";

export function detectExerciseIntent(text: string): ExerciseType | null {
  const t = text.toLowerCase();

  if (t.includes("breathing") || t.includes("breathe") || t.includes("breathwork"))
    return "breathing";

  if (t.includes("grounding") || t.includes("ground me") || t.includes("i feel anxious"))
    return "grounding";

  if (t.includes("mindfulness") || t.includes("be present") || t.includes("calm my mind"))
    return "mindfulness";

  if (t.includes("stressed") || t.includes("stress") || t.includes("overwhelmed"))
    return "stressReset";

  return null;
}

