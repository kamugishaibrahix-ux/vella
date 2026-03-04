import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logSecurityEvent, drainSecurityEvents } from "@/lib/telemetry/securityEvents";

const FORBIDDEN_METADATA_KEYS = [
  "content",
  "text",
  "message",
  "body",
  "transcript",
  "journal",
  "prompt",
  "response",
  "note",
  "summary",
  "payload",
  "request_body",
  "raw_body",
];

describe("Security Telemetry: No Forbidden Content in Logs", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    drainSecurityEvents();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    drainSecurityEvents();
  });

  it("logSecurityEvent produces valid structured payload", () => {
    logSecurityEvent("PLAN_RESOLUTION_FAILED", {
      user_id: "test-user",
      tier: "unknown",
      context: "test",
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArg = errorSpy.mock.calls[0][1] as string;
    const parsed = JSON.parse(loggedArg);

    expect(parsed.event).toBe("PLAN_RESOLUTION_FAILED");
    expect(parsed.timestamp).toBeDefined();
    expect(typeof parsed.timestamp).toBe("string");
    expect(parsed.metadata.tier).toBe("unknown");
  });

  it("logSecurityEvent metadata must NOT contain forbidden keys", () => {
    const safeEvents: Array<[string, Record<string, unknown>]> = [
      ["PLAN_RESOLUTION_FAILED", { user_id: "u1", tier: "bad", context: "test" }],
      ["TIER_CORRUPTION", { user_id: "u2", raw_plan: "invalid", source: "webhook" }],
      ["LEGACY_TIER_ALIAS_BLOCKED", { rawPlan: "basic" }],
      ["PLAN_LOOKUP_FAILURE", { user_id: "u3", error: "db timeout" }],
      ["BULK_RECALC_CORRUPTION", { user_id: "u4", plan: "bad", request_id: "r1" }],
      ["STRIPE_WEBHOOK_INVALID_TIER", { subscription_id: "s1", price_id: "p1", reason: "unmapped" }],
    ];

    for (const [eventName, metadata] of safeEvents) {
      logSecurityEvent(eventName as any, metadata);
    }

    const events = drainSecurityEvents();
    for (const event of events) {
      const metaKeys = Object.keys(event.metadata);
      for (const key of metaKeys) {
        expect(
          FORBIDDEN_METADATA_KEYS.includes(key.toLowerCase()),
          `Event "${event.event}" has forbidden metadata key "${key}". Security logs must not contain user content.`
        ).toBe(false);
      }
    }
  });

  it("logSecurityEvent metadata values must not contain large text blobs", () => {
    logSecurityEvent("PLAN_RESOLUTION_FAILED", {
      user_id: "test-user",
      tier: "unknown",
      context: "getUserPlanTier",
    });

    const events = drainSecurityEvents();
    for (const event of events) {
      for (const [key, value] of Object.entries(event.metadata)) {
        if (typeof value === "string") {
          expect(
            value.length,
            `Event "${event.event}" metadata key "${key}" has string value of length ${value.length}. Max 512 chars allowed.`
          ).toBeLessThanOrEqual(512);
        }
      }
    }
  });

  it("drainSecurityEvents clears the buffer", () => {
    logSecurityEvent("TIER_CORRUPTION", { user_id: "u1" });
    logSecurityEvent("TIER_CORRUPTION", { user_id: "u2" });

    const first = drainSecurityEvents();
    expect(first.length).toBe(2);

    const second = drainSecurityEvents();
    expect(second.length).toBe(0);
  });

  it("console.error output contains only structured JSON, no raw objects", () => {
    logSecurityEvent("PLAN_LOOKUP_FAILURE", {
      user_id: "test",
      error: "connection refused",
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const args = errorSpy.mock.calls[0];

    // First arg is the prefix string
    expect(typeof args[0]).toBe("string");
    expect(args[0]).toContain("[SECURITY_EVENT:");

    // Second arg must be a JSON string (not a raw object)
    expect(typeof args[1]).toBe("string");
    expect(() => JSON.parse(args[1] as string)).not.toThrow();
  });
});
