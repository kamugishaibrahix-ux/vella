// Maps emotional arcs into voice delivery curves.

import type { EmotionalArc } from "./extractArc";

export function emotionalVoiceCurve(arc: EmotionalArc) {
  switch (arc.arc) {
    case "rise":
      return {
        pace: "slightly_faster",
        breaths: "light",
        softness: "medium",
        emphasis: "gentle",
      };
    case "peak":
      return {
        pace: "slower",
        breaths: "longer",
        softness: "soft",
        emphasis: "minimal",
      };
    case "fall":
      return {
        pace: "balanced",
        breaths: "natural",
        softness: "medium",
        emphasis: "slight",
      };
    case "resolution":
    default:
      return {
        pace: "steady",
        breaths: "subtle",
        softness: "soft",
        emphasis: "light",
      };
  }
}

