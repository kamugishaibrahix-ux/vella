// REMOVED - No runtime voice delivery modifiers allowed
// This function injected pause and emphasis annotations that could be interpreted by the model
// export function enhanceNarrativeCadence(text: string): string {
//   if (!text) return text;
//
//   let out = text;
//   out = out.replace(/\b(then|after|suddenly|meanwhile)\b/gi, "$& [pause_200ms]");
//   out = out.replace(
//     /\b(softly|gently|slowly|carefully|quietly)\b/gi,
//     "[emphasis_light] $&",
//   );
//   if (out.length > 140) {
//     out = out.replace(/\./, ". [pause_300ms]");
//   }
//   return out;
// }

// Placeholder to prevent import errors - function is disabled
export function enhanceNarrativeCadence(text: string): string {
  return text; // Return text unchanged - no annotations
}

