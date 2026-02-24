"use server";

const TRAIT_MAP: Record<string, RegExp> = {
  resilience: /(kept going|bounced back|recovered)/i,
  clarity: /(understand|see clearly|naming)/i,
  discipline: /(routine|habit|stuck with)/i,
  motivation: /(excited|driven|motivated)/i,
  self_compassion: /(kind to myself|gave myself grace|self-compassion)/i,
};

export async function extractTraitMarkers(text: string | null | undefined): Promise<string[]> {
  const markers: string[] = [];
  for (const [trait, pattern] of Object.entries(TRAIT_MAP)) {
    if (pattern.test(text ?? "")) {
      markers.push(trait);
    }
  }
  return markers;
}

