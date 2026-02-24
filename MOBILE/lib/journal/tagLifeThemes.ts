"use server";

const THEME_KEYWORDS: Record<string, RegExp[]> = {
  "Identity & self-worth": [/worth/, /enough/, /identity/, /self/],
  "Connection & belonging": [/friend/, /relationship/, /partner/, /lonely/],
  "Purpose & direction": [/career/, /purpose/, /direction/, /goal/],
  "Energy & capacity": [/tired/, /burnout/, /energy/, /fatigue/],
  "Emotional regulation": [/panic/, /stress/, /calm/, /breathe/],
};

export async function tagLifeThemes(text: string | null | undefined): Promise<string[]> {
  const lower = (text ?? "").toLowerCase();
  if (!lower) return [];
  const matches: string[] = [];
  for (const [theme, patterns] of Object.entries(THEME_KEYWORDS)) {
    if (patterns.some((pattern) => pattern.test(lower))) {
      matches.push(theme);
    }
  }
  return matches.slice(0, 3);
}

