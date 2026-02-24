/**
 * Phase 8 — Personality profile tests.
 */
import { describe, it, expect } from "vitest";
import {
  VELLA_PERSONALITY,
  type PersonalityProfile,
} from "@/lib/ai/personalityProfile";
import { buildVellaTextPrompt } from "@/lib/ai/textPrompts";

describe("VELLA_PERSONALITY", () => {
  it("profile exists and is non-empty", () => {
    expect(VELLA_PERSONALITY).toBeDefined();
    expect(Object.keys(VELLA_PERSONALITY).length).toBeGreaterThan(0);
  });

  it("intellectualStyle is one of stoic | pragmatic | analytical", () => {
    const allowed: PersonalityProfile["intellectualStyle"][] = ["stoic", "pragmatic", "analytical"];
    expect(allowed).toContain(VELLA_PERSONALITY.intellectualStyle);
    expect(VELLA_PERSONALITY.intellectualStyle).toBe("stoic");
  });

  it("moralBias is accountability_first", () => {
    expect(VELLA_PERSONALITY.moralBias).toBe("accountability_first");
  });

  it("conversationalStandard is direct_but_fair", () => {
    expect(VELLA_PERSONALITY.conversationalStandard).toBe("direct_but_fair");
  });

  it("toleranceForExcuses is 0, 1, or 2", () => {
    expect([0, 1, 2]).toContain(VELLA_PERSONALITY.toleranceForExcuses);
    expect(VELLA_PERSONALITY.toleranceForExcuses).toBe(1);
  });
});

describe("personality prompt injection", () => {
  it("prompt contains PERSONALITY PROFILE block and instructions", () => {
    const prompt = buildVellaTextPrompt({
      userMessage: "Hi",
      language: "en",
    });
    expect(prompt).toContain("PERSONALITY PROFILE (Stable — Do Not Deviate)");
    expect(prompt).toContain(JSON.stringify(VELLA_PERSONALITY));
    expect(prompt).toContain("Maintain consistent worldview");
    expect(prompt).toContain("Prefer accountability over reassurance");
    expect(prompt).toContain("Never flatter");
    expect(prompt).toContain("Never seek validation");
  });
});
