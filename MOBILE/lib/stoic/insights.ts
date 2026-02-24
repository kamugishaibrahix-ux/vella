type StoicInsight = {
  id: string;
  quote: string;
  author: string;
  theme:
    | "fear"
    | "control"
    | "patience"
    | "acceptance"
    | "courage"
    | "perspective"
    | "discipline";
};

const deterministicPick = <T>(items: T[], seed: number): T => {
  const index = Math.abs(seed) % items.length;
  return items[index]!;
};

const STOIC_INSIGHTS: StoicInsight[] = [
  {
    id: "fear-1",
    quote: "We suffer more often in imagination than in reality.",
    author: "Seneca",
    theme: "fear",
  },
  {
    id: "control-1",
    quote: "Make the best use of what is in your power, and take the rest as it happens.",
    author: "Epictetus",
    theme: "control",
  },
  {
    id: "perspective-1",
    quote: "It is not things themselves that disturb us, but our judgements about them.",
    author: "Epictetus",
    theme: "perspective",
  },
  {
    id: "discipline-1",
    quote: "If it is not right, do not do it; if it is not true, do not say it.",
    author: "Marcus Aurelius",
    theme: "discipline",
  },
  {
    id: "acceptance-1",
    quote: "Receive without pride, let go without attachment.",
    author: "Marcus Aurelius",
    theme: "acceptance",
  },
  {
    id: "courage-1",
    quote: "Difficulties strengthen the mind, as labour does the body.",
    author: "Seneca",
    theme: "courage",
  },
  {
    id: "patience-1",
    quote: "No great thing is created suddenly.",
    author: "Epictetus",
    theme: "patience",
  },
];

export function pickStoicInsightForDay(params: { mood: number; stress: number }): StoicInsight {
  console.log("[STOIC] pickStoicInsightForDay invoked with args:", { mood: params.mood, stress: params.stress });
  const { mood, stress } = params;
  let theme: StoicInsight["theme"] = "perspective";
  if (mood <= 3 || stress >= 8) {
    theme = "fear";
  } else if (stress >= 6 && mood <= 6) {
    theme = "acceptance";
  } else if (mood >= 7 && stress <= 4) {
    theme = "discipline";
  } else if (mood >= 5 && stress >= 5) {
    theme = "patience";
  }
  const candidates = STOIC_INSIGHTS.filter((insight) => insight.theme === theme);
  if (candidates.length === 0) {
    const result = STOIC_INSIGHTS[0];
    console.log("[STOIC] pickStoicInsightForDay result:", result);
    return result;
  }
  const seed = Math.round(mood * 10 + stress * 13);
  const result = deterministicPick(candidates, seed);
  console.log("[STOIC] pickStoicInsightForDay result:", result, "theme:", theme, "seed:", seed);
  return result;
}

// --- Daily Stoic Cache ---
export function getCachedStoicNote(): { quote: string; author: string } | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem("vella.stoic.today");

  if (!raw) return null;

  try {
    const { date, quote, author } = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (date === today) return { quote, author };
  } catch {}

  return null;
}

export function setCachedStoicNote(note: { quote: string; author: string }) {
  if (typeof window === "undefined") return;
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(
    "vella.stoic.today",
    JSON.stringify({ date: today, ...note }),
  );
}

