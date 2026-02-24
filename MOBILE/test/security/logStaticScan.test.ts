/**
 * Phase 0 Lockdown: static scan for forbidden identifier logging.
 * Regex must flag console.log(reply|content|message|...) in app/lib and must not flag safe metadata logs.
 */

import { describe, it, expect } from "vitest";

// Must stay in sync with scripts/checkPhase0Lockdown.mjs FORBIDDEN_LOG_REGEX
const FORBIDDEN_LOG_REGEX =
  /console\s*\.\s*(log|error|warn)\s*\(\s*(reply|content|message|transcript|prompt|summary|note)\b|console\s*\.\s*(log|error|warn)\s*\([^)]*,\s*(reply|content|message|transcript|prompt|summary|note)\b/i;

describe("log static scan (forbidden identifier logging)", () => {
  it("flags console.log(reply) as violation", () => {
    expect(FORBIDDEN_LOG_REGEX.test("console.log(reply)")).toBe(true);
  });

  it("flags console.error(err, message) as violation", () => {
    expect(FORBIDDEN_LOG_REGEX.test("console.error(err, message)")).toBe(true);
  });

  it("flags console.warn(x, content) as violation", () => {
    expect(FORBIDDEN_LOG_REGEX.test("console.warn(x, content)")).toBe(true);
  });

  it("flags console.log( reply ) with spaces as violation", () => {
    expect(FORBIDDEN_LOG_REGEX.test("console.log( reply )")).toBe(true);
  });

  it("does not flag console.log('safe metadata')", () => {
    expect(FORBIDDEN_LOG_REGEX.test("console.log('safe metadata')")).toBe(false);
  });

  it("does not flag console.log(\"safe metadata\")", () => {
    expect(FORBIDDEN_LOG_REGEX.test('console.log("safe metadata")')).toBe(false);
  });

  it("does not flag string literal containing reply", () => {
    expect(FORBIDDEN_LOG_REGEX.test('console.log("reply")')).toBe(false);
  });

  it("does not flag safe metadata logging", () => {
    expect(FORBIDDEN_LOG_REGEX.test("console.log(LOG_PREFIX, JSON.stringify(payload))")).toBe(false);
  });

  it("does not flag label-only error log", () => {
    expect(FORBIDDEN_LOG_REGEX.test("console.error(label, msg)")).toBe(false);
  });
});
