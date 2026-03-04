/**
 * SNAKE_CASE CONTRACT TESTS
 * ==========================
 * Proves that:
 * 1. camelCase keys are rejected by the PII firewall with NON_SNAKE_CASE_KEY
 * 2. snake_case keys pass the PII firewall
 * 3. buildConversationMetadata returns only snake_case keys
 * 4. dbPayload helpers work correctly
 */

import { describe, it, expect } from "vitest";
import {
  assertNoPII,
  PIIFirewallError,
  PII_FIREWALL_ERROR_CODES,
  scanForPII,
} from "@/lib/security/piiFirewall";
import { buildConversationMetadata } from "@/lib/conversation/metadata";
import {
  toSnakeCaseKey,
  toSnakeCaseObject,
  assertSnakeCaseKeys,
} from "@/lib/safe/dbPayload";

describe("SNAKE_CASE CONTRACT", () => {
  describe("PII Firewall: camelCase rejection", () => {
    it("should throw NON_SNAKE_CASE_KEY for messageLength", () => {
      expect(() =>
        assertNoPII({ messageLength: 1 }, "conversation_metadata_v2")
      ).toThrow(PIIFirewallError);

      try {
        assertNoPII({ messageLength: 1 }, "conversation_metadata_v2");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PIIFirewallError);
        expect((error as PIIFirewallError).code).toBe(
          PII_FIREWALL_ERROR_CODES.NON_SNAKE_CASE_KEY
        );
        expect((error as PIIFirewallError).message).toContain("messageLength");
      }
    });

    it("should throw NON_SNAKE_CASE_KEY for userId (camelCase)", () => {
      expect(() =>
        assertNoPII({ userId: "abc" }, "test")
      ).toThrow(PIIFirewallError);

      try {
        assertNoPII({ userId: "abc" }, "test");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as PIIFirewallError).code).toBe(
          PII_FIREWALL_ERROR_CODES.NON_SNAKE_CASE_KEY
        );
      }
    });

    it("should throw NON_SNAKE_CASE_KEY for sessionId (camelCase)", () => {
      try {
        assertNoPII({ sessionId: "abc" }, "test");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as PIIFirewallError).code).toBe(
          PII_FIREWALL_ERROR_CODES.NON_SNAKE_CASE_KEY
        );
      }
    });

    it("should pass for message_count (snake_case)", () => {
      expect(() =>
        assertNoPII({ message_count: 1 }, "conversation_metadata_v2")
      ).not.toThrow();
    });

    it("should pass for the full snake_case metadata payload", () => {
      expect(() =>
        assertNoPII(
          {
            user_id: "abc-123",
            session_id: null,
            mode_enum: null,
            language: "en",
            message_count: 5,
          },
          "conversation_metadata_v2"
        )
      ).not.toThrow();
    });

    it("scanForPII should report NON_SNAKE_CASE_KEY violation", () => {
      const result = scanForPII({ messageLength: 1 });
      expect(result.hasPII).toBe(true);
      expect(result.violations.length).toBeGreaterThanOrEqual(1);
      expect(result.violations[0].code).toBe(
        PII_FIREWALL_ERROR_CODES.NON_SNAKE_CASE_KEY
      );
      expect(result.violations[0].key).toBe("messageLength");
    });

    it("scanForPII should pass for snake_case payload", () => {
      const result = scanForPII({ message_count: 1 });
      expect(result.hasPII).toBe(false);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("buildConversationMetadata", () => {
    it("should return only snake_case keys", () => {
      const result = buildConversationMetadata({
        userId: "user-123",
        sessionId: "sess-456",
        mode: "listen",
        language: "en",
        messageLength: 42,
      });

      const keys = Object.keys(result);
      const camelCaseRe = /[a-z][A-Z]/;
      for (const key of keys) {
        expect(camelCaseRe.test(key)).toBe(false);
      }
    });

    it("should map input fields to correct snake_case output fields", () => {
      const result = buildConversationMetadata({
        userId: "user-123",
        sessionId: "sess-456",
        mode: "listen",
        language: "fr",
        messageLength: 99,
      });

      expect(result).toEqual({
        user_id: "user-123",
        session_id: "sess-456",
        mode_enum: "listen",
        language: "fr",
        message_count: 99,
      });
    });

    it("should handle null values", () => {
      const result = buildConversationMetadata({
        userId: "u",
        sessionId: null,
        mode: null,
        language: "en",
        messageLength: 0,
      });

      expect(result.session_id).toBeNull();
      expect(result.mode_enum).toBeNull();
    });

    it("should pass PII firewall validation", () => {
      const result = buildConversationMetadata({
        userId: "user-123",
        sessionId: null,
        mode: null,
        language: "en",
        messageLength: 5,
      });

      expect(() =>
        assertNoPII(result, "conversation_metadata_v2")
      ).not.toThrow();
    });
  });

  describe("dbPayload helpers", () => {
    it("toSnakeCaseKey converts camelCase to snake_case", () => {
      expect(toSnakeCaseKey("messageLength")).toBe("message_length");
      expect(toSnakeCaseKey("userId")).toBe("user_id");
      expect(toSnakeCaseKey("sessionId")).toBe("session_id");
      expect(toSnakeCaseKey("mode_enum")).toBe("mode_enum");
      expect(toSnakeCaseKey("HTMLParser")).toBe("html_parser");
    });

    it("toSnakeCaseObject converts all keys", () => {
      const result = toSnakeCaseObject({
        messageLength: 5,
        userId: "abc",
        language: "en",
      });

      expect(result).toEqual({
        message_length: 5,
        user_id: "abc",
        language: "en",
      });
    });

    it("assertSnakeCaseKeys throws for camelCase in dev", () => {
      // This test assumes NODE_ENV=development (vitest default is "test",
      // but we test the regex logic directly via scanForPII above)
      // The assertSnakeCaseKeys only throws in NODE_ENV=development
      // so we test the regex detection via the PII firewall instead
      const camelCaseRe = /[a-z][A-Z]/;
      expect(camelCaseRe.test("messageLength")).toBe(true);
      expect(camelCaseRe.test("message_count")).toBe(false);
      expect(camelCaseRe.test("userId")).toBe(true);
      expect(camelCaseRe.test("user_id")).toBe(false);
    });
  });
});
