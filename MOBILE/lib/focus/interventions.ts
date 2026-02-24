/**
 * Deterministic quick interventions by subject and optional cause. No LLM. No free text from user.
 */

export type Intervention = {
  title: string;
  body: string;
};

/** Cause-agnostic intervention by subject (used when no cause selected). */
export function getInterventionForSubject(subjectCode: string): Intervention {
  switch (subjectCode) {
    case "smoking":
      return {
        title: "Delay the urge",
        body: "Wait 10 minutes before acting. Take 6 slow breaths.",
      };
    case "focus":
      return {
        title: "2-minute reset",
        body: "Clear your desk and write one single next action.",
      };
    case "habit":
      return {
        title: "Reduce friction",
        body: "Do the smallest possible version of this habit now.",
      };
    default:
      return {
        title: "Pause",
        body: "Take 5 breaths and reset your intention.",
      };
  }
}

/** Deterministic intervention by subject and selected cause. */
export function getIntervention(subjectCode: string, selectedCause: string): Intervention {
  const key = `${subjectCode}:${selectedCause}`;
  const causeMap: Record<string, Intervention> = {
    "smoking:Urge spike": { title: "Delay the urge", body: "Wait 10 minutes. Take 6 slow breaths." },
    "smoking:Social pressure": { title: "Step back", body: "Excuse yourself. One breath. Reply when ready." },
    "smoking:Stress trigger": { title: "Pause", body: "Do one thing that lowers stress first (walk, breath)." },
    "smoking:Habit reflex": { title: "Interrupt the loop", body: "Do a different small action instead." },
    "smoking:Other": getInterventionForSubject("smoking"),
    "focus:Distracted": { title: "Single task", body: "Close other tabs. One task for 2 minutes." },
    "focus:Overwhelmed": { title: "Smallest step", body: "Write the one next action. Do only that." },
    "focus:Avoiding task": { title: "2-minute start", body: "Work on it for 2 minutes. You can stop after." },
    "focus:Low energy": { title: "Reset first", body: "Brief movement or 5 breaths. Then one task." },
    "focus:Other": getInterventionForSubject("focus"),
    "habit:Low motivation": { title: "Reduce friction", body: "Do the smallest possible version now." },
    "habit:Environment friction": { title: "Change one thing", body: "Adjust the environment so the habit is easier." },
    "habit:Forgot": { title: "Anchor it", body: "Tie it to something you already do (after X, I do Y)." },
    "habit:Time constraint": { title: "Micro version", body: "Do 30 seconds of it. Consistency over length." },
    "habit:Other": getInterventionForSubject("habit"),
    "other:Low motivation": { title: "Pause", body: "Take 5 breaths. Reset intention." },
    "other:Environment friction": { title: "One change", body: "Remove one obstacle or add one cue." },
    "other:Forgot": { title: "Cue it", body: "Set one reminder or anchor to an existing habit." },
    "other:Time constraint": { title: "Smallest step", body: "Do the tiniest version possible now." },
    "other:Other": getInterventionForSubject("other"),
  };
  return causeMap[key] ?? getInterventionForSubject(subjectCode);
}

const SUBJECT_LABEL: Record<string, string> = {
  smoking: "No smoking",
  alcohol: "No alcohol",
  focus: "Deep work",
  habit: "Daily habit",
  other: "Weekly focus",
};

/** Deterministic user message for focus_intervention API. Server-only. */
export function buildFocusInterventionMessage(subjectCode: string): string {
  const label = SUBJECT_LABEL[subjectCode] ?? "this focus";
  return `I'm struggling with ${label} this week and would like to discuss.`;
}
