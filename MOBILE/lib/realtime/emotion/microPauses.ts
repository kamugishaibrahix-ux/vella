// REMOVED - No runtime voice delivery modifiers allowed
// This function injected pause annotations that could be interpreted by the model
// export function injectMicroPauses(text: string): string {
//   if (!text) return text;
//
//   return text
//     .replace(/\,/g, " [pause_70ms] ")
//     .replace(/\./g, " [pause_120ms] ")
//     .replace(/\!/g, " [pause_150ms] ")
//     .replace(/\?/g, " [pause_160ms] ");
// }

// Placeholder to prevent import errors - function is disabled
export function injectMicroPauses(text: string): string {
  return text; // Return text unchanged - no annotations
}

