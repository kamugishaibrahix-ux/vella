/**
 * Exercise Library - Static collection of mind & body exercises
 * 15+ exercises across 4 categories: stabilise, focus, energy, recovery
 * All local, no remote storage
 */

export type ExerciseCategory = "stabilise" | "focus" | "energy" | "recovery";

export interface Exercise {
  id: string;
  title: string;
  category: ExerciseCategory;
  durationSeconds: number;
  tags: string[];
  description: string;
}

// ---------------------------------------------------------------------------
// Exercise Library - 18 Exercises
// ---------------------------------------------------------------------------

export const EXERCISE_LIBRARY: Exercise[] = [
  // === STABILISE (6 exercises) ===
  // For when feeling heavy, anxious, scattered
  {
    id: "stabilise-1",
    title: "Grounding Breath",
    category: "stabilise",
    durationSeconds: 180,
    tags: ["breath", "calm", "anxiety"],
    description: "Slow 4-7-8 breathing to calm the nervous system. Inhale 4 counts, hold 7, exhale 8.",
  },
  {
    id: "stabilise-2",
    title: "Body Scan",
    category: "stabilise",
    durationSeconds: 300,
    tags: ["body", "awareness", "tension"],
    description: "Systematic scan from head to toe, releasing tension in each body part.",
  },
  {
    id: "stabilise-3",
    title: "Box Breathing",
    category: "stabilise",
    durationSeconds: 240,
    tags: ["breath", "focus", "military"],
    description: "4-4-4-4 pattern. Inhale, hold, exhale, hold - each for 4 counts.",
  },
  {
    id: "stabilise-4",
    title: "5-4-3-2-1 Senses",
    category: "stabilise",
    durationSeconds: 180,
    tags: ["grounding", "present", "anxiety"],
    description: "Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste.",
  },
  {
    id: "stabilise-5",
    title: "Cold Water Reset",
    category: "stabilise",
    durationSeconds: 60,
    tags: ["physical", "shock", "reset"],
    description: "Splash cold water on face or hold ice cube. Triggers mammalian dive reflex.",
  },
  {
    id: "stabilise-6",
    title: "Wall Sit",
    category: "stabilise",
    durationSeconds: 120,
    tags: ["physical", "strength", "grounding"],
    description: "Back flat against wall, knees at 90 degrees. Hold the position, breathe steady.",
  },

  // === FOCUS (5 exercises) ===
  // For when feeling lighter, ready to concentrate
  {
    id: "focus-1",
    title: "Pomodoro Sprint",
    category: "focus",
    durationSeconds: 1500,
    tags: ["work", "productivity", "time"],
    description: "25 minutes of single-task focus. No distractions. Phone away. One thing only.",
  },
  {
    id: "focus-2",
    title: "Single-Point Focus",
    category: "focus",
    durationSeconds: 600,
    tags: ["meditation", "concentration", "clarity"],
    description: "Gaze at a candle flame or fixed point. When mind wanders, return to the point.",
  },
  {
    id: "focus-3",
    title: "Brain Dump",
    category: "focus",
    durationSeconds: 300,
    tags: ["writing", "clear", "mental-clutter"],
    description: "Write every thought down without editing. Clear mental RAM. Then close the page.",
  },
  {
    id: "focus-4",
    title: "Deep Work Block",
    category: "focus",
    durationSeconds: 3600,
    tags: ["work", "deep", "flow"],
    description: "One hour of deep work. No notifications. No multitasking. Full immersion.",
  },
  {
    id: "focus-5",
    title: "Counting Breath",
    category: "focus",
    durationSeconds: 300,
    tags: ["breath", "concentration", "mind"],
    description: "Count breaths from 1 to 10. If you lose count, start again. Simple but hard.",
  },

  // === ENERGY (4 exercises) ===
  // For baseline days, maintaining momentum
  {
    id: "energy-1",
    title: "Quick HIIT",
    category: "energy",
    durationSeconds: 420,
    tags: ["physical", "intense", "movement"],
    description: "30 seconds on, 15 seconds rest. 8 rounds. Jumping jacks, burpees, high knees.",
  },
  {
    id: "energy-2",
    title: "Power Pose",
    category: "energy",
    durationSeconds: 120,
    tags: ["confidence", "posture", "hormones"],
    description: "Stand like Superman for 2 minutes. Hands on hips, chest open, chin up.",
  },
  {
    id: "energy-3",
    title: "Cold Shower Finish",
    category: "energy",
    durationSeconds: 60,
    tags: ["physical", "shock", "willpower"],
    description: "End your shower with 60 seconds of cold water. Builds discipline and alertness.",
  },
  {
    id: "energy-4",
    title: "Sun Salutation",
    category: "energy",
    durationSeconds: 300,
    tags: ["yoga", "movement", "flow"],
    description: "5 rounds of sun salutation. Link breath with movement. Wake the body.",
  },

  // === RECOVERY (3 exercises) ===
  // For winding down, restoring, preparing for rest
  {
    id: "recovery-1",
    title: "Legs Up Wall",
    category: "recovery",
    durationSeconds: 600,
    tags: ["rest", "circulation", "calm"],
    description: "Lie on back, legs vertical against wall. Gentle inversion for nervous system.",
  },
  {
    id: "recovery-2",
    title: "Progressive Relaxation",
    category: "recovery",
    durationSeconds: 420,
    tags: ["body", "tension", "sleep-prep"],
    description: "Tense then release each muscle group. Start at feet, work up to face.",
  },
  {
    id: "recovery-3",
    title: "Gratitude Listing",
    category: "recovery",
    durationSeconds: 180,
    tags: ["mental", "positive", "reflection"],
    description: "Write or mentally list 3 things you're grateful for. Specific, not generic.",
  },
];

// ---------------------------------------------------------------------------
// Query Helpers
// ---------------------------------------------------------------------------

export function getExercisesByCategory(category: ExerciseCategory): Exercise[] {
  return EXERCISE_LIBRARY.filter((e) => e.category === category);
}

export function getExerciseById(id: string): Exercise | undefined {
  return EXERCISE_LIBRARY.find((e) => e.id === id);
}

export function getAllCategories(): ExerciseCategory[] {
  return ["stabilise", "focus", "energy", "recovery"];
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins} min${mins !== 1 ? "s" : ""}`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ---------------------------------------------------------------------------
// Daily Log Types (for tracking completions locally)
// ---------------------------------------------------------------------------

export interface ExerciseLogEntry {
  id: string;
  exerciseId: string;
  completedAt: number; // unix ms
  durationSeconds: number;
  dateKey: string; // YYYY-MM-DD
}

export async function logExerciseCompletion(
  exerciseId: string,
  durationSeconds: number
): Promise<ExerciseLogEntry> {
  const entry: ExerciseLogEntry = {
    id: crypto.randomUUID(),
    exerciseId,
    completedAt: Date.now(),
    durationSeconds,
    dateKey: new Date().toISOString().slice(0, 10),
  };

  // Store in localStorage (simple approach, no need for IndexedDB for logs)
  const key = "vella-exercise-log";
  const existing: ExerciseLogEntry[] = JSON.parse(localStorage.getItem(key) || "[]");
  existing.push(entry);
  localStorage.setItem(key, JSON.stringify(existing));

  return entry;
}

export function getTodayExerciseLogs(): ExerciseLogEntry[] {
  const key = "vella-exercise-log";
  const today = new Date().toISOString().slice(0, 10);
  const all: ExerciseLogEntry[] = JSON.parse(localStorage.getItem(key) || "[]");
  return all.filter((e) => e.dateKey === today);
}
