/**
 * RUNTIME FIREWALL PROOF - UNIT TESTS
 * ===================================
 * Tests for assertNoPII() and the PII Firewall.
 * Proves that all attack payloads are blocked at runtime.
 */

import { describe, it, expect } from "vitest";
import {
  assertNoPII,
  assertNoPIIInBatch,
  PIIFirewallError,
  PII_FIREWALL_ERROR_CODES,
  scanForPII,
  payloadContainsPII,
  isForbiddenKey,
  isSemanticVector,
} from "@/lib/security/piiFirewall";
import {
  allAttacks,
  safePayloads,
  attackMetadata,
  directForbiddenKeys,
  nestedKeyAttacks,
  obfuscatedKeyAttacks,
  jsonEmbeddingAttacks,
  unicodeTrickAttacks,
  arrayAttacks,
} from "./attackStrings";

describe("PII Firewall - Runtime Enforcement", () => {
  describe("ATTACK DEFENSE: All attack payloads must be blocked", () => {
    it("should block ALL 85+ attack payloads", () => {
      let blockedCount = 0;
      const failedAttacks: Array<{ payload: unknown; error: string }> = [];

      for (const payload of allAttacks) {
        try {
          assertNoPII(payload, "test_table");
          // If we get here, the attack was NOT blocked
          failedAttacks.push({ payload, error: "Was not blocked" });
        } catch (error) {
          if (error instanceof PIIFirewallError) {
            blockedCount++;
          } else {
            failedAttacks.push({ payload, error: String(error) });
          }
        }
      }

      console.log(`[TEST] Blocked ${blockedCount}/${allAttacks.length} attacks`);

      if (failedAttacks.length > 0) {
        console.error("[TEST] FAILED ATTACKS:", failedAttacks.slice(0, 5));
      }

      expect(blockedCount).toBe(allAttacks.length);
      expect(failedAttacks).toHaveLength(0);
    });

    it("should block direct forbidden keys", () => {
      for (const payload of directForbiddenKeys) {
        expect(() => assertNoPII(payload, "test")).toThrow(PIIFirewallError);
      }
    });

    it("should block nested key attacks", () => {
      for (const payload of nestedKeyAttacks) {
        expect(() => assertNoPII(payload, "test")).toThrow(PIIFirewallError);
      }
    });

    it("should block obfuscated key attacks", () => {
      for (const payload of obfuscatedKeyAttacks) {
        expect(() => assertNoPII(payload, "test")).toThrow(PIIFirewallError);
      }
    });

    it("should block JSON embedding attacks", () => {
      for (const payload of jsonEmbeddingAttacks) {
        expect(() => assertNoPII(payload, "test")).toThrow(PIIFirewallError);
      }
    });

    it("should block Unicode trick attacks", () => {
      for (const payload of unicodeTrickAttacks) {
        expect(() => assertNoPII(payload, "test")).toThrow(PIIFirewallError);
      }
    });

    it("should block array attacks", () => {
      for (const payload of arrayAttacks) {
        expect(() => assertNoPII(payload, "test")).toThrow(PIIFirewallError);
      }
    });
  });

  describe("SAFE PAYLOADS: Valid metadata must pass", () => {
    it("should allow ALL safe payloads", () => {
      let passedCount = 0;
      const failedSafe: Array<{ payload: unknown; error: string }> = [];

      for (const payload of safePayloads) {
        try {
          assertNoPII(payload, "test_table");
          passedCount++;
        } catch (error) {
          failedSafe.push({ payload, error: String(error) });
        }
      }

      console.log(`[TEST] Allowed ${passedCount}/${safePayloads.length} safe payloads`);

      if (failedSafe.length > 0) {
        console.error("[TEST] FALSE POSITIVES:", failedSafe);
      }

      expect(passedCount).toBe(safePayloads.length);
      expect(failedSafe).toHaveLength(0);
    });

    it("should allow metadata-only objects", () => {
      expect(() =>
        assertNoPII(
          {
            id: "123",
            user_id: "user_123",
            local_hash: "abc123",
            mood_score: 7,
            word_count: 150,
          },
          "journal_entries_meta"
        )
      ).not.toThrow();
    });

    it("should allow enums and flags", () => {
      expect(() =>
        assertNoPII(
          {
            type: "journal",
            status: "active",
            severity: "low",
            domain: "health",
          },
          "test"
        )
      ).not.toThrow();
    });

    it("should allow null values", () => {
      expect(() =>
        assertNoPII(
          {
            note: null,
            content: null,
            text: null,
          },
          "test"
        )
      ).not.toThrow();
    });

    it("should allow empty objects", () => {
      expect(() => assertNoPII({}, "test")).not.toThrow();
    });
  });

  describe("BATCH OPERATIONS", () => {
    it("should block batch with any forbidden field", () => {
      const batch = [
        { user_id: "1", local_hash: "hash1" },
        { user_id: "2", content: "FORBIDDEN" }, // This one has PII
        { user_id: "3", local_hash: "hash3" },
      ];

      expect(() => assertNoPIIInBatch(batch, "test")).toThrow(PIIFirewallError);
    });

    it("should allow batch with all safe payloads", () => {
      const batch = [
        { user_id: "1", local_hash: "hash1", mood_score: 5 },
        { user_id: "2", local_hash: "hash2", mood_score: 7 },
        { user_id: "3", local_hash: "hash3", mood_score: 3 },
      ];

      expect(() => assertNoPIIInBatch(batch, "test")).not.toThrow();
    });
  });

  describe("ERROR TYPES AND CODES", () => {
    it("should throw FORBIDDEN_FIELD_DETECTED for direct keys", () => {
      try {
        assertNoPII({ content: "test" }, "test");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PIIFirewallError);
        expect((error as PIIFirewallError).code).toBe(
          PII_FIREWALL_ERROR_CODES.FORBIDDEN_FIELD_DETECTED
        );
        expect((error as PIIFirewallError).keyPath).toContain("content");
      }
    });

    it("should throw SEMANTIC_SMUGGLING_DETECTED for vectors", () => {
      try {
        assertNoPII({ detail: "test" }, "test");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PIIFirewallError);
        expect((error as PIIFirewallError).code).toBe(
          PII_FIREWALL_ERROR_CODES.SEMANTIC_SMUGGLING_DETECTED
        );
      }
    });

    it("should include table name in error", () => {
      try {
        assertNoPII({ text: "test" }, "journal_entries_meta");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as PIIFirewallError).message).toContain("journal_entries_meta");
      }
    });
  });

  describe("SCANNING FUNCTIONS", () => {
    it("scanForPII should return detailed results", () => {
      const result = scanForPII({ content: "test", message: "test2" });

      expect(result.hasPII).toBe(true);
      expect(result.violations).toHaveLength(2);
      expect(result.scannedKeys).toBeGreaterThan(0);
    });

    it("payloadContainsPII should return boolean", () => {
      expect(payloadContainsPII({ content: "test" })).toBe(true);
      expect(payloadContainsPII({ local_hash: "abc123" })).toBe(false);
    });
  });

  describe("KEY DETECTION", () => {
    it("isForbiddenKey should detect all forbidden keys (case-insensitive)", () => {
      expect(isForbiddenKey("content")).toBe(true);
      expect(isForbiddenKey("Content")).toBe(true);
      expect(isForbiddenKey("CONTENT")).toBe(true);
      expect(isForbiddenKey("text")).toBe(true);
      expect(isForbiddenKey("message")).toBe(true);
    });

    it("isForbiddenKey should NOT detect safe keys", () => {
      expect(isForbiddenKey("id")).toBe(false);
      expect(isForbiddenKey("user_id")).toBe(false);
      expect(isForbiddenKey("local_hash")).toBe(false);
      expect(isForbiddenKey("mood_score")).toBe(false);
    });

    it("isSemanticVector should detect smuggling vectors", () => {
      expect(isSemanticVector("detail")).toBe(true);
      expect(isSemanticVector("raw")).toBe(true);
      expect(isSemanticVector("payload")).toBe(true);
    });
  });

  describe("SPECIFIC ATTACK SCENARIOS", () => {
    it("should block journal entry attempt", () => {
      const attack = {
        user_id: "user_123",
        title: "My Private Thoughts",
        content: "Today I felt really depressed about work...",
        local_hash: "abc123",
      };

      expect(() => assertNoPII(attack, "journal_entries_meta")).toThrow(
        PIIFirewallError
      );
    });

    it("should block check-in with note", () => {
      const attack = {
        user_id: "user_123",
        mood_score: 3,
        note: "Feeling anxious about the presentation tomorrow",
      };

      expect(() => assertNoPII(attack, "check_ins_v2")).toThrow(PIIFirewallError);
    });

    it("should block conversation message", () => {
      const attack = {
        user_id: "user_123",
        session_id: "sess_123",
        content: "I'm having suicidal thoughts",
        role: "user",
      };

      expect(() => assertNoPII(attack, "conversation_metadata_v2")).toThrow(
        PIIFirewallError
      );
    });

    it("should block memory chunk with content", () => {
      const attack = {
        user_id: "user_123",
        content: "Remember: my password is secret123",
        content_hash: "hash123",
      };

      expect(() => assertNoPII(attack, "memory_chunks")).toThrow(PIIFirewallError);
    });

    it("should block deeply nested personal text", () => {
      const attack = {
        level1: {
          level2: {
            level3: {
              level4: {
                content: "Deeply hidden personal information",
              },
            },
          },
        },
      };

      expect(() => assertNoPII(attack, "test")).toThrow(PIIFirewallError);
    });
  });
});

// Test report generation
console.log("\n" + "=".repeat(60));
console.log("PII FIREWALL RUNTIME PROOF - TEST SUITE");
console.log("=".repeat(60));
console.log(`Total attack payloads: ${allAttacks.length}`);
console.log(`Total safe payloads: ${safePayloads.length}`);
console.log(`Attack categories tested:`);
console.log(`  - Direct forbidden keys: ${directForbiddenKeys.length}`);
console.log(`  - Nested attacks: ${nestedKeyAttacks.length}`);
console.log(`  - Obfuscated keys: ${obfuscatedKeyAttacks.length}`);
console.log(`  - JSON embeddings: ${jsonEmbeddingAttacks.length}`);
console.log(`  - Unicode tricks: ${unicodeTrickAttacks.length}`);
console.log(`  - Array attacks: ${arrayAttacks.length}`);
console.log("=".repeat(60) + "\n");
