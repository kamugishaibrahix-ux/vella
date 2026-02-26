import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveGuardrails,
  saveGuardrails,
  isTriggerEngineEnabled,
  setTriggerEngineEnabled,
  DEFAULT_GUARDRAILS,
} from "@/lib/execution/guardrails";

describe("resolveGuardrails", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when no localStorage entry", () => {
    const g = resolveGuardrails();
    expect(g).toEqual(DEFAULT_GUARDRAILS);
  });

  it("returns defaults when localStorage has invalid JSON", () => {
    window.localStorage.setItem("vella_execution_guardrails", "not json");
    const g = resolveGuardrails();
    expect(g).toEqual(DEFAULT_GUARDRAILS);
  });

  it("returns defaults when localStorage has non-object", () => {
    window.localStorage.setItem("vella_execution_guardrails", '"string"');
    const g = resolveGuardrails();
    expect(g).toEqual(DEFAULT_GUARDRAILS);
  });

  it("reads valid overrides from localStorage", () => {
    window.localStorage.setItem(
      "vella_execution_guardrails",
      JSON.stringify({ max_triggers_per_day: 10, cooldown_minutes: 15 })
    );
    const g = resolveGuardrails();
    expect(g.max_triggers_per_day).toBe(10);
    expect(g.cooldown_minutes).toBe(15);
    expect(g.quiet_hours_start).toBeNull();
    expect(g.quiet_hours_end).toBeNull();
  });

  it("clamps out-of-range max_triggers_per_day to default", () => {
    window.localStorage.setItem(
      "vella_execution_guardrails",
      JSON.stringify({ max_triggers_per_day: 999 })
    );
    const g = resolveGuardrails();
    expect(g.max_triggers_per_day).toBe(DEFAULT_GUARDRAILS.max_triggers_per_day);
  });

  it("clamps negative cooldown_minutes to default", () => {
    window.localStorage.setItem(
      "vella_execution_guardrails",
      JSON.stringify({ cooldown_minutes: -5 })
    );
    const g = resolveGuardrails();
    expect(g.cooldown_minutes).toBe(DEFAULT_GUARDRAILS.cooldown_minutes);
  });

  it("rejects non-integer cooldown_minutes", () => {
    window.localStorage.setItem(
      "vella_execution_guardrails",
      JSON.stringify({ cooldown_minutes: 10.5 })
    );
    const g = resolveGuardrails();
    expect(g.cooldown_minutes).toBe(DEFAULT_GUARDRAILS.cooldown_minutes);
  });

  it("accepts valid quiet hours", () => {
    window.localStorage.setItem(
      "vella_execution_guardrails",
      JSON.stringify({ quiet_hours_start: 22, quiet_hours_end: 6 })
    );
    const g = resolveGuardrails();
    expect(g.quiet_hours_start).toBe(22);
    expect(g.quiet_hours_end).toBe(6);
  });

  it("rejects invalid quiet hours (>23)", () => {
    window.localStorage.setItem(
      "vella_execution_guardrails",
      JSON.stringify({ quiet_hours_start: 25, quiet_hours_end: -1 })
    );
    const g = resolveGuardrails();
    expect(g.quiet_hours_start).toBeNull();
    expect(g.quiet_hours_end).toBeNull();
  });
});

describe("saveGuardrails", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists config to localStorage", () => {
    saveGuardrails({ max_triggers_per_day: 8 });
    const raw = window.localStorage.getItem("vella_execution_guardrails");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.max_triggers_per_day).toBe(8);
  });

  it("merges with existing config", () => {
    saveGuardrails({ max_triggers_per_day: 8 });
    saveGuardrails({ cooldown_minutes: 10 });
    const g = resolveGuardrails();
    expect(g.max_triggers_per_day).toBe(8);
    expect(g.cooldown_minutes).toBe(10);
  });
});

describe("isTriggerEngineEnabled / setTriggerEngineEnabled", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("is OFF by default", () => {
    expect(isTriggerEngineEnabled()).toBe(false);
  });

  it("can be enabled", () => {
    setTriggerEngineEnabled(true);
    expect(isTriggerEngineEnabled()).toBe(true);
  });

  it("can be disabled after enabling", () => {
    setTriggerEngineEnabled(true);
    setTriggerEngineEnabled(false);
    expect(isTriggerEngineEnabled()).toBe(false);
  });
});
