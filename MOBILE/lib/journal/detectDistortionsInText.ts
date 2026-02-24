"use server";

const DISTORTION_PATTERNS: Record<string, RegExp> = {
  Catastrophising: /(everything will go wrong|disaster|ruined)/i,
  "All-or-nothing thinking": /(always|never|everyone|no one)/i,
  "Emotional reasoning": /(because i feel|i feel so it must be)/i,
  MindReading: /(they must think|i know what they think)/i,
};

export async function detectDistortionsInText(text: string | null | undefined): Promise<string[]> {
  const matches: string[] = [];
  for (const [label, pattern] of Object.entries(DISTORTION_PATTERNS)) {
    if (pattern.test(text ?? "")) {
      matches.push(label.replace(/([a-z])([A-Z])/g, "$1 $2"));
    }
  }
  return matches.slice(0, 3);
}

