import type { ProsodyVector } from "./prosodyVectors";

// REMOVED - No runtime voice delivery modifiers allowed
// This function generated instruction strings that could dynamically modify voice parameters
// export function compileProsody(p: ProsodyVector): string {
//   return `
// Adjust your vocal delivery with these parameters:
// - Pitch expressiveness: ${(p.pitch * 100).toFixed(0)}%
// - Speaking pace: ${(p.pace * 100).toFixed(0)}%
// - Pause frequency: ${(p.pause * 100).toFixed(0)}%
// - Breathiness: ${(p.breathiness * 100).toFixed(0)}%
// - Emphasis intensity: ${(p.emphasis * 100).toFixed(0)}%
// Translate these into natural speech patterns:
// - modulate pitch subtly
// - apply pacing that matches the emotional tone
// - use breaths and micro-pauses naturally
// - use emphasis only to highlight key emotional lines
// `.trim();
// }

// Placeholder to prevent import errors - function is disabled
export function compileProsody(p: ProsodyVector): string {
  return ""; // Return empty string - no voice delivery instructions
}

