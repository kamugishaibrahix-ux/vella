/**
 * Focus Areas - Local storage for user's active focus domains
 * No automatic recommendations, just structured storage
 */

export type FocusDomain =
  | "self-mastery"
  | "addiction-recovery"
  | "emotional-intelligence"
  | "relationships"
  | "performance-focus"
  | "identity-purpose"
  | "physical-health"
  | "financial-discipline";

/** Legacy domain mapping for backwards compatibility */
const LEGACY_DOMAIN_MAP: Record<string, FocusDomain> = {
  "decision-clarity": "emotional-intelligence",
  "emotional-regulation": "emotional-intelligence",
  "identity-direction": "identity-purpose",
};

/** Migrate legacy domain to canonical domain */
export function migrateDomain(domain: string): FocusDomain {
  if (domain in LEGACY_DOMAIN_MAP) {
    return LEGACY_DOMAIN_MAP[domain];
  }
  // Type guard: check if it's a valid FocusDomain
  const validDomains: FocusDomain[] = [
    "self-mastery",
    "addiction-recovery",
    "emotional-intelligence",
    "relationships",
    "performance-focus",
    "identity-purpose",
    "physical-health",
    "financial-discipline",
  ];
  if (validDomains.includes(domain as FocusDomain)) {
    return domain as FocusDomain;
  }
  // Fallback to emotional-intelligence for unknown domains
  return "emotional-intelligence";
}

export interface FocusArea {
  domain: FocusDomain;
  subtype?: string;
  addedAt: number;
}

const FOCUS_AREAS_KEY = "vella-focus-areas";
const FOCUS_AREAS_VERSION_KEY = "vella-focus-areas-version";
const CURRENT_VERSION = "2";

function migrateStoredFocusAreas(): void {
  try {
    const storedVersion = localStorage.getItem(FOCUS_AREAS_VERSION_KEY);
    if (storedVersion === CURRENT_VERSION) return;

    const stored = localStorage.getItem(FOCUS_AREAS_KEY);
    if (!stored) {
      localStorage.setItem(FOCUS_AREAS_VERSION_KEY, CURRENT_VERSION);
      return;
    }

    const areas: FocusArea[] = JSON.parse(stored);
    const migrated = areas.map((area) => ({
      ...area,
      domain: migrateDomain(area.domain),
    }));

    localStorage.setItem(FOCUS_AREAS_KEY, JSON.stringify(migrated));
    localStorage.setItem(FOCUS_AREAS_VERSION_KEY, CURRENT_VERSION);
  } catch {
    // Silent fail - migration is best-effort
  }
}

export function getFocusAreas(): FocusArea[] {
  try {
    migrateStoredFocusAreas();
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

/**
 * Returns the user's currently selected focus domain labels (max 3).
 * Source of truth: localStorage "vella-focus-areas".
 * Returns empty array if none selected.
 */
export function getSelectedDomainLabels(): string[] {
  const areas = getFocusAreas();
  if (areas.length === 0) return [];
  return areas
    .slice(0, 3)
    .map((a) => DOMAIN_METADATA[a.domain]?.label ?? a.domain);
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
    subtypes: [
      "Morning routine",
      "Evening wind-down",
      "Digital boundaries",
      "Physical training",
      "Habit building",
      "Impulse control",
    ],
  },
  "addiction-recovery": {
    label: "Addiction Recovery",
    description: "Sobriety, urges, abstinence tracking",
    subtypes: [
      "Substance sobriety",
      "Behavioral abstinence",
      "Urge resistance",
      "Relapse prevention",
      "Recovery milestones",
    ],
  },
  "emotional-intelligence": {
    label: "Emotional Intelligence",
    description: "Anxiety, stress, emotional patterns",
    subtypes: [
      "Anxiety regulation",
      "Anger control",
      "Mood stability",
      "Stress management",
      "Cognitive clarity",
    ],
  },
  relationships: {
    label: "Relationships",
    description: "Family, romantic, social dynamics",
    subtypes: [
      "Romantic relationships",
      "Family dynamics",
      "Friendships",
      "Work relationships",
      "Communication growth",
    ],
  },
  "performance-focus": {
    label: "Performance & Focus",
    description: "Work, deep focus, execution",
    subtypes: [
      "Deep work",
      "Creative output",
      "Learning goals",
      "Career execution",
      "Consistency tracking",
    ],
  },
  "identity-purpose": {
    label: "Identity & Purpose",
    description: "Meaning, values, life direction",
    subtypes: [
      "Life purpose",
      "Values alignment",
      "Strength discovery",
      "Personal evolution",
      "Long-term vision",
    ],
  },
  "physical-health": {
    label: "Physical Health & Energy",
    description: "Sleep, recovery, body regulation",
    subtypes: [
      "Sleep discipline",
      "Exercise routine",
      "Energy optimization",
      "Stress recovery",
      "Body awareness",
    ],
  },
  "financial-discipline": {
    label: "Financial Discipline",
    description: "Spending control, resource management",
    subtypes: [
      "Budget control",
      "Spending restraint",
      "Savings goals",
      "Financial planning",
      "Impulse spending control",
    ],
  },
};
