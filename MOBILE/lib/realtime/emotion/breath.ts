// REMOVED - No runtime voice delivery modifiers allowed
// This function injected breath annotations that could be interpreted by the model
// export function applyBreathiness(
//   text: string,
//   level: "low" | "med" | "high",
// ): string {
//   if (!text) return text;
//
//   switch (level) {
//     case "low":
//       return text;
//     case "med":
//       return `[breath_soft] ${text}`;
//     case "high":
//       return `[breath_soft] ${text.replace(/\./g, " [breath] .")}`;
//     default:
//       return text;
//   }
// }

// Placeholder to prevent import errors - function is disabled
export function applyBreathiness(
  text: string,
  level: "low" | "med" | "high",
): string {
  return text; // Return text unchanged - no annotations
}

