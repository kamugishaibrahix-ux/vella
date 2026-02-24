import type { IntelligenceFeed } from "./types";

const now = Date.now();

export const LOCAL_INTELLIGENCE_FEED: IntelligenceFeed = {
  lastUpdated: now,
  items: [
    {
      id: "mindset_focus",
      category: "mindset",
      title: "Micro-focus cycles",
      summary: "Work in calm 10-minute cycles and take a short pause to avoid overwhelm.",
      tags: ["focus", "overwhelm", "productivity"],
      timestamp: now,
    },
    {
      id: "wellbeing_breath",
      category: "wellbeing",
      title: "Box breathing reset",
      summary: "Inhale 4 seconds, hold 4, exhale 4, hold 4 — quickly lowers tension.",
      tags: ["calm", "breathing", "anxiety"],
      timestamp: now,
    },
    {
      id: "productivity_checkpoint",
      category: "productivity",
      title: "Checkpoint journaling",
      summary: "Write one sentence about what's true right now to regain momentum.",
      tags: ["clarity", "journaling"],
      timestamp: now,
    },
    {
      id: "creativity_prompt",
      category: "creativity",
      title: "Three-angle prompt",
      summary: "Describe the same idea as a question, a metaphor, and a headline.",
      tags: ["creativity", "writing"],
      timestamp: now,
    },
    {
      id: "language_softening",
      category: "language",
      title: "Softening phrases",
      summary: "Lead sentences with “from what I’m sensing…” to stay gentle yet clear.",
      tags: ["communication", "language"],
      timestamp: now,
    },
    {
      id: "mindset_gratitude",
      category: "mindset",
      title: "Gratitude snapshot",
      summary: "Name one tiny thing that felt good today to anchor positive bias.",
      tags: ["gratitude", "mood"],
      timestamp: now,
    },
    {
      id: "wellbeing_mini_walk",
      category: "wellbeing",
      title: "90-second micro-walk",
      summary: "Stand, stretch, and take 40 steps indoors to reset breathing rhythm.",
      tags: ["movement", "energy"],
      timestamp: now,
    },
    {
      id: "productivity_batching",
      category: "productivity",
      title: "Micro-batching replies",
      summary: "Answer similar messages together to protect deep work energy.",
      tags: ["communication", "focus"],
      timestamp: now,
    },
  ],
};

