import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFlag, writeFlag, readISODate, readInt } from "@/lib/local/runtimeFlags";

// ---------------------------------------------------------------------------
// Test 1: runtimeFlags returns null / 0 in SSR (window undefined)
// ---------------------------------------------------------------------------

describe("runtimeFlags — SSR safety (window undefined)", () => {
  let savedWindow: typeof globalThis.window;

  beforeEach(() => {
    savedWindow = globalThis.window;
    // @ts-expect-error — intentionally removing window to simulate SSR
    delete globalThis.window;
  });

  afterEach(() => {
    globalThis.window = savedWindow;
  });

  it("readFlag returns null when window is undefined", () => {
    expect(readFlag("any_key")).toBeNull();
  });

  it("writeFlag does not throw when window is undefined", () => {
    expect(() => writeFlag("any_key", "val")).not.toThrow();
  });

  it("readISODate returns null when window is undefined", () => {
    expect(readISODate("any_key")).toBeNull();
  });

  it("readInt returns 0 when window is undefined", () => {
    expect(readInt("any_key")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2: runtimeFlags — normal browser operation
// ---------------------------------------------------------------------------

describe("runtimeFlags — browser operation", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("readFlag returns null when key absent", () => {
    expect(readFlag("missing_key")).toBeNull();
  });

  it("writeFlag + readFlag round-trip", () => {
    writeFlag("test_flag", "hello");
    expect(readFlag("test_flag")).toBe("hello");
  });

  it("readISODate parses a valid ISO timestamp", () => {
    const iso = new Date(2030, 0, 1).toISOString();
    writeFlag("test_date", iso);
    const d = readISODate("test_date");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe(iso);
  });

  it("readISODate returns null for garbage value", () => {
    writeFlag("test_date", "not-a-date");
    expect(readISODate("test_date")).toBeNull();
  });

  it("readInt returns 0 when key absent", () => {
    expect(readInt("missing_int")).toBe(0);
  });

  it("readInt parses a valid integer", () => {
    writeFlag("test_int", "7");
    expect(readInt("test_int")).toBe(7);
  });

  it("readInt returns 0 for non-numeric value", () => {
    writeFlag("test_int", "abc");
    expect(readInt("test_int")).toBe(0);
  });

  it("writeFlag does not throw on quota error (mocked)", () => {
    const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => writeFlag("quota_test", "val")).not.toThrow();
    setItemSpy.mockRestore();
  });
});
