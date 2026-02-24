/**
 * Deterministic intervention engine — no LLM, allowlisted content only.
 */
import { describe, it, expect } from "vitest";
import { getInterventionForSubject } from "@/lib/focus/interventions";

describe("getInterventionForSubject", () => {
  it("returns deterministic content for smoking", () => {
    const r = getInterventionForSubject("smoking");
    expect(r.title).toBe("Delay the urge");
    expect(r.body).toBe("Wait 10 minutes before acting. Take 6 slow breaths.");
  });

  it("returns deterministic content for focus", () => {
    const r = getInterventionForSubject("focus");
    expect(r.title).toBe("2-minute reset");
    expect(r.body).toBe("Clear your desk and write one single next action.");
  });

  it("returns deterministic content for habit", () => {
    const r = getInterventionForSubject("habit");
    expect(r.title).toBe("Reduce friction");
    expect(r.body).toBe("Do the smallest possible version of this habit now.");
  });

  it("returns default for unknown subject", () => {
    const r = getInterventionForSubject("other");
    expect(r.title).toBe("Pause");
    expect(r.body).toBe("Take 5 breaths and reset your intention.");
  });

  it("returns default for arbitrary code", () => {
    const r = getInterventionForSubject("unknown_code");
    expect(r.title).toBe("Pause");
    expect(r.body).toBe("Take 5 breaths and reset your intention.");
  });
});
