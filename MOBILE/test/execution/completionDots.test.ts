import { describe, it, expect } from "vitest";
import { computeCompletionDots, type DayDot } from "@/lib/execution/completionDots";

function makeEvent(occurredAt: string, outcomeCode: string) {
  return {
    occurred_at: occurredAt,
    metadata: { outcome_code: outcomeCode },
  };
}

describe("computeCompletionDots", () => {
  const NOW = "2026-02-24T12:00:00Z";

  it("returns 7 dots", () => {
    const dots = computeCompletionDots([], NOW);
    expect(dots).toHaveLength(7);
  });

  it("returns all 'none' when no events", () => {
    const dots = computeCompletionDots([], NOW);
    for (const dot of dots) {
      expect(dot.state).toBe("none");
    }
  });

  it("marks today as completed when event exists", () => {
    const events = [makeEvent("2026-02-24T08:00:00Z", "completed")];
    const dots = computeCompletionDots(events, NOW);
    const today = dots[6]; // last dot = today
    expect(today.date).toBe("2026-02-24");
    expect(today.state).toBe("completed");
  });

  it("marks correct day as skipped", () => {
    const events = [makeEvent("2026-02-23T10:00:00Z", "skipped")];
    const dots = computeCompletionDots(events, NOW);
    const yesterday = dots[5];
    expect(yesterday.date).toBe("2026-02-23");
    expect(yesterday.state).toBe("skipped");
  });

  it("marks correct day as missed", () => {
    const events = [makeEvent("2026-02-22T10:00:00Z", "missed")];
    const dots = computeCompletionDots(events, NOW);
    const twoDaysAgo = dots[4];
    expect(twoDaysAgo.date).toBe("2026-02-22");
    expect(twoDaysAgo.state).toBe("missed");
  });

  it("completed takes priority over skipped on same day", () => {
    const events = [
      makeEvent("2026-02-24T06:00:00Z", "skipped"),
      makeEvent("2026-02-24T10:00:00Z", "completed"),
    ];
    const dots = computeCompletionDots(events, NOW);
    expect(dots[6].state).toBe("completed");
  });

  it("skipped takes priority over missed on same day", () => {
    const events = [
      makeEvent("2026-02-24T06:00:00Z", "missed"),
      makeEvent("2026-02-24T10:00:00Z", "skipped"),
    ];
    const dots = computeCompletionDots(events, NOW);
    expect(dots[6].state).toBe("skipped");
  });

  it("ignores events older than 7 days", () => {
    const events = [makeEvent("2026-02-10T10:00:00Z", "completed")];
    const dots = computeCompletionDots(events, NOW);
    for (const dot of dots) {
      expect(dot.state).toBe("none");
    }
  });

  it("handles multiple days with mixed outcomes", () => {
    const events = [
      makeEvent("2026-02-24T08:00:00Z", "completed"),
      makeEvent("2026-02-23T08:00:00Z", "skipped"),
      makeEvent("2026-02-22T08:00:00Z", "completed"),
      makeEvent("2026-02-21T08:00:00Z", "missed"),
    ];
    const dots = computeCompletionDots(events, NOW);
    expect(dots[6].state).toBe("completed"); // Feb 24
    expect(dots[5].state).toBe("skipped");   // Feb 23
    expect(dots[4].state).toBe("completed"); // Feb 22
    expect(dots[3].state).toBe("missed");    // Feb 21
    expect(dots[2].state).toBe("none");      // Feb 20
    expect(dots[1].state).toBe("none");      // Feb 19
    expect(dots[0].state).toBe("none");      // Feb 18
  });

  it("includes day labels", () => {
    const dots = computeCompletionDots([], NOW);
    const labels = dots.map((d) => d.dayLabel);
    // Feb 24, 2026 is a Tuesday
    expect(labels[6]).toBe("Tue"); // today
    expect(labels[5]).toBe("Mon"); // yesterday
  });

  it("includes correct date keys", () => {
    const dots = computeCompletionDots([], NOW);
    expect(dots[6].date).toBe("2026-02-24");
    expect(dots[5].date).toBe("2026-02-23");
    expect(dots[0].date).toBe("2026-02-18");
  });

  it("ignores events with missing metadata", () => {
    const events = [
      { occurred_at: "2026-02-24T08:00:00Z", metadata: null },
      { occurred_at: "2026-02-24T08:00:00Z", metadata: {} },
    ];
    const dots = computeCompletionDots(events, NOW);
    expect(dots[6].state).toBe("none");
  });

  it("ignores events with unknown outcome_code", () => {
    const events = [makeEvent("2026-02-24T08:00:00Z", "abandoned")];
    const dots = computeCompletionDots(events, NOW);
    expect(dots[6].state).toBe("none");
  });
});
