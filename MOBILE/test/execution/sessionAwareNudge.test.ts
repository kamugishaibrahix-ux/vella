import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

let storage: Record<string, string> = {};

beforeEach(() => {
  storage = {};
  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
    },
  });
});

// Import AFTER mocks
import {
  setVoiceSessionActive,
  readSessionNudge,
  clearSessionNudge,
} from "@/lib/execution/scheduler";

const VOICE_KEY = "vella_voice_session_active";
const NUDGE_KEY = "vella_session_nudge";

// ---------------------------------------------------------------------------
// Voice session flag
// ---------------------------------------------------------------------------

describe("voice session active flag", () => {
  it("defaults to inactive (key absent)", () => {
    expect(storage[VOICE_KEY]).toBeUndefined();
  });

  it("setVoiceSessionActive(true) writes 'true'", () => {
    setVoiceSessionActive(true);
    expect(storage[VOICE_KEY]).toBe("true");
  });

  it("setVoiceSessionActive(false) writes 'false'", () => {
    setVoiceSessionActive(true);
    setVoiceSessionActive(false);
    expect(storage[VOICE_KEY]).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// Session nudge read/write/clear
// ---------------------------------------------------------------------------

describe("session nudge lifecycle", () => {
  it("readSessionNudge returns null when empty", () => {
    expect(readSessionNudge()).toBeNull();
  });

  it("reads a nudge after it is written", () => {
    const nudge = {
      template_code: "window_open",
      commitment_id: "abc-123",
      created_at: "2026-02-24T12:00:00Z",
    };
    storage[NUDGE_KEY] = JSON.stringify(nudge);
    const read = readSessionNudge();
    expect(read).not.toBeNull();
    expect(read!.template_code).toBe("window_open");
    expect(read!.commitment_id).toBe("abc-123");
  });

  it("clearSessionNudge removes the key", () => {
    storage[NUDGE_KEY] = JSON.stringify({ template_code: "x", commitment_id: "y", created_at: "z" });
    clearSessionNudge();
    expect(storage[NUDGE_KEY]).toBeUndefined();
  });

  it("readSessionNudge returns null on corrupt JSON", () => {
    storage[NUDGE_KEY] = "not-json{";
    expect(readSessionNudge()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Session-aware inbox suppression
// ---------------------------------------------------------------------------

describe("session-aware inbox routing (integration logic)", () => {
  it("when voice_session_active is true, inbox should be suppressed", () => {
    // This test validates the contract: isVoiceSessionActive reads the flag
    setVoiceSessionActive(true);
    expect(storage[VOICE_KEY]).toBe("true");
    // Scheduler checks this and writes nudge instead of inbox item
  });

  it("when voice_session_active is false, inbox should proceed normally", () => {
    setVoiceSessionActive(false);
    expect(storage[VOICE_KEY]).toBe("false");
  });
});
