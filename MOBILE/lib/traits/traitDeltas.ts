export type TraitScoresLike = {
  resilience: number;
  clarity: number;
  discipline: number;
  emotional_stability: number;
  motivation: number;
  self_compassion: number;
};

export type TraitDelta = {
  label: keyof TraitScoresLike;
  from: number | null;
  to: number | null;
  direction: "up" | "down" | "stable" | "unknown";
};

export function computeTraitDeltas(
  traitsNow: TraitScoresLike | null,
  traitsPrev: TraitScoresLike | null,
): TraitDelta[] {
  const keys: (keyof TraitScoresLike)[] = [
    "resilience",
    "clarity",
    "discipline",
    "emotional_stability",
    "motivation",
    "self_compassion",
  ];

  return keys.map((key) => {
    const from = traitsPrev?.[key] ?? null;
    const to = traitsNow?.[key] ?? null;
    let direction: TraitDelta["direction"] = "unknown";

    if (typeof from === "number" && typeof to === "number") {
      const diff = Math.round(to - from);
      if (Math.abs(diff) < 3) {
        direction = "stable";
      } else if (diff > 0) {
        direction = "up";
      } else {
        direction = "down";
      }
    }

    return {
      label: key,
      from,
      to,
      direction,
    };
  });
}

