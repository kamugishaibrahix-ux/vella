export function isNarrativeMode(text: string): boolean {
  if (!text) return false;

  const t = text.trim().toLowerCase();
  const strongTriggers = [
    "once upon a time",
    "imagine",
    "picture this",
    "you find yourself",
    "you walk",
    "you step",
    "you notice",
    "you enter",
    "you begin",
    "the scene",
    "the story begins",
    "guide you",
    "let’s take a deep breath",
    "close your eyes",
  ];

  for (const trigger of strongTriggers) {
    if (t.includes(trigger)) return true;
  }

  const sensoryVerbs = ["see", "hear", "feel", "notice", "touch", "smell"];
  const words = t.split(/\s+/);
  let count = 0;
  for (const w of words) {
    if (sensoryVerbs.includes(w)) count++;
  }
  if (count / words.length > 0.2) return true;

  return false;
}

