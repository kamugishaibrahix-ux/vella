/**
 * Focus Areas - Local storage for user's active focus domains
 * No automatic recommendations, just structured storage
 */

export type FocusDomain =
  | "self-mastery"
  | "addiction-recovery"
  | "relationships"
  | "emotional-regulation"
  | "decision-clarity"
  | "performance-focus"
  | "identity-direction";

export interface FocusArea {
  domain: FocusDomain;
  subtype?: string;
  addedAt: number;
}

const FOCUS_AREAS_KEY = "vella-focus-areas";

export function getFocusAreas(): FocusArea[] {
  try {
    const stored = localStorage.getItem(FOCUS_AREAS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveFocusArea(domain: FocusDomain, subtype?: string): FocusArea {
  const existing = getFocusAreas();
  const newArea: FocusArea = {
    domain,
    subtype,
    addedAt: Date.now(),
  };
  const updated = [...existing.filter((a) => a.domain !== domain), newArea];
  localStorage.setItem(FOCUS_AREAS_KEY, JSON.stringify(updated));
  return newArea;
}

export function removeFocusArea(domain: FocusDomain): void {
  const existing = getFocusAreas();
  const updated = existing.filter((a) => a.domain !== domain);
  localStorage.setItem(FOCUS_AREAS_KEY, JSON.stringify(updated));
}

export function hasFocusArea(domain: FocusDomain): boolean {
  return getFocusAreas().some((a) => a.domain === domain);
}

export const DOMAIN_METADATA: Record<
  FocusDomain,
  {
    label: string;
    description: string;
    subtypes?: string[];
  }
> = {
  "self-mastery": {
    label: "Self-Mastery",
    description: "Discipline, habits, personal control",
    subtypes: ["Morning routine", "Evening wind-down", "Digital boundaries", "Physical training"],
  },
  "addiction-recovery": {
    label: "Addiction Recovery",
    description: "Sobriety, urges, abstinence tracking",
    subtypes: ["Substance", "Behavioral", "Process", "Relapse prevention"],
  },
  relationships: {
    label: "Relationships",
    description: "Family, romantic, social dynamics",
    subtypes: ["Romantic", "Family", "Friendships", "Work relationships"],
  },
  "emotional-regulation": {
    label: "Emotional Regulation",
    description: "Anxiety, anger, mood management",
    subtypes: ["Anxiety", "Anger", "Depression", "Overwhelm"],
  },
  "decision-clarity": {
    label: "Decision Clarity",
    description: "Choices, forks, uncertainty",
    subtypes: ["Career", "Relocation", "Relationship", "Financial"],
  },
  "performance-focus": {
    label: "Performance & Focus",
    description: "Work, flow, productivity",
    subtypes: ["Deep work", "Creative projects", "Learning", "Career goals"],
  },
  "identity-direction": {
    label: "Identity & Direction",
    description: "Purpose, meaning, life path",
    subtypes: ["Life purpose", "Values alignment", "Legacy", "Transitions"],
  },
};
