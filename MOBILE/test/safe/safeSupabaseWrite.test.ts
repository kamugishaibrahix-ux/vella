/**
 * Safe data writers: WRITE_BLOCKED_TABLES blocks user_nudges (and other legacy content tables).
 */
import { describe, it, expect } from "vitest";
import { safeInsert, SafeDataError } from "@/lib/safe/safeSupabaseWrite";

const dummyClient = { from: () => ({ insert: () => ({}) }) };

describe("safeInsert WRITE_BLOCKED_TABLES", () => {
  it("throws SafeDataError WRITE_BLOCKED_TABLE for user_nudges", () => {
    expect(() => {
      safeInsert("user_nudges", { message: "hi" } as Record<string, unknown>, undefined, dummyClient as any);
    }).toThrow(SafeDataError);
    try {
      safeInsert("user_nudges", { message: "hi" } as Record<string, unknown>, undefined, dummyClient as any);
    } catch (e) {
      expect(e).toBeInstanceOf(SafeDataError);
      expect((e as SafeDataError).code).toBe("WRITE_BLOCKED_TABLE");
      expect((e as SafeDataError).table).toBe("user_nudges");
    }
  });
});
