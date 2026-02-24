/**
 * Journal rebuild – cognitive processing surface.
 * UI-only types; no backend coupling in components.
 */

export type JournalModeId =
  | "clear-head"
  | "reflect-today"
  | "work-through"
  | "plan"
  | "make-sense-feeling"
  | "free-write";

export interface JournalMode {
  id: JournalModeId;
  label: string;
  prompts?: string[]; // structured prompts; undefined = free write
}

export const JOURNAL_MODES: JournalMode[] = [
  { id: "clear-head", label: "Clear my head", prompts: ["What's on your mind?", "What can you let go of right now?"] },
  { id: "reflect-today", label: "Reflect on today", prompts: ["What stood out today?", "What are you grateful for?", "What would you do differently?"] },
  {
    id: "work-through",
    label: "Work through something",
    prompts: [
      "What happened?",
      "What are you feeling?",
      "What do you want instead?",
      "What would a stronger version of you do?",
    ],
  },
  { id: "plan", label: "Plan something", prompts: ["What do you want to achieve?", "What's the first step?", "What might get in the way?"] },
  { id: "make-sense-feeling", label: "Make sense of a feeling", prompts: ["What are you feeling?", "When did you first notice it?", "What does it need?"] },
  { id: "free-write", label: "Free write" },
];

export interface JournalEntryDraft {
  modeId: JournalModeId;
  modeLabel: string;
  structuredResponses?: string[];
  freeText?: string;
  consentToLearn: boolean;
}

export interface JournalEntry {
  id: string;
  createdAt: string; // ISO
  modeId: JournalModeId;
  modeLabel: string;
  title: string;
  preview: string;
  tag?: string; // e.g. "Conflict", "Focus", "Identity", "Recovery"
  sharedWithVella: boolean;
  structuredResponses?: string[];
  freeText?: string;
}

export const REFLECTION_REINFORCEMENTS = [
  "Clarity increased.",
  "Reflection depth: Moderate.",
  "Insight signal detected.",
  "Consistency building.",
] as const;
