/**
 * Deterministic help cause options by subject. No free text.
 */

export function getHelpOptions(subjectCode: string): string[] {
  switch (subjectCode) {
    case "smoking":
      return [
        "Urge spike",
        "Social pressure",
        "Stress trigger",
        "Habit reflex",
        "Other",
      ];
    case "focus":
      return [
        "Distracted",
        "Overwhelmed",
        "Avoiding task",
        "Low energy",
        "Other",
      ];
    default:
      return [
        "Low motivation",
        "Environment friction",
        "Forgot",
        "Time constraint",
        "Other",
      ];
  }
}
