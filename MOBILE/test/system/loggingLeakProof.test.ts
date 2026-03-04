/**
 * LOGGING AND TRANSIENT TEXT PROOF (B6)
 * =====================================
 * Tests that verify canary strings never appear in logs.
 * This prevents "sneaky leaks" through error messages or console output.
 *
 * Test harness:
 * - Calls assertNoPII with unique canary strings
 * - Captures in-memory logs
 * - Asserts canary never appears
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assertNoPII, PIIFirewallError } from "@/lib/security/piiFirewall";
import { canaryStrings } from "../../tests/pii/attackStrings";

describe("B6: LOGGING AND TRANSIENT TEXT PROOF", () => {
  // Store original console methods
  let capturedLogs: string[] = [];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalInfo: typeof console.info;

  beforeEach(() => {
    // Reset captured logs
    capturedLogs = [];

    // Store originals
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalInfo = console.info;

    // Mock console to capture logs
    console.log = (...args: unknown[]) => {
      const msg = args.map(a => String(a)).join(" ");
      capturedLogs.push(msg);
    };
    console.error = (...args: unknown[]) => {
      const msg = args.map(a => String(a)).join(" ");
      capturedLogs.push(msg);
    };
    console.warn = (...args: unknown[]) => {
      const msg = args.map(a => String(a)).join(" ");
      capturedLogs.push(msg);
    };
    console.info = (...args: unknown[]) => {
      const msg = args.map(a => String(a)).join(" ");
      capturedLogs.push(msg);
    };
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  });

  describe("Canary string leak detection", () => {
    it("should NEVER log canary string from content field", () => {
      const canary = canaryStrings[0];

      try {
        assertNoPII({ content: canary }, "test_table");
      } catch (error) {
        // Expected - should throw
      }

      // Check that canary does NOT appear in any log
      const canaryFound = capturedLogs.some(log => log.includes(canary));

      if (canaryFound) {
        console.error("[B6] LEAK DETECTED! Logs containing canary:");
        capturedLogs.filter(log => log.includes(canary)).forEach(log => console.error(log));
      }

      expect(canaryFound).toBe(false);
    });

    it("should NEVER log canary string from text field", () => {
      const canary = canaryStrings[1];

      try {
        assertNoPII({ text: canary }, "test_table");
      } catch (error) {
        // Expected
      }

      const canaryFound = capturedLogs.some(log => log.includes(canary));
      expect(canaryFound).toBe(false);
    });

    it("should NEVER log canary string from message field", () => {
      const canary = canaryStrings[2];

      try {
        assertNoPII({ message: canary }, "test_table");
      } catch (error) {
        // Expected
      }

      const canaryFound = capturedLogs.some(log => log.includes(canary));
      expect(canaryFound).toBe(false);
    });

    it("should NEVER log canary string from nested object", () => {
      const canary = "CANARY_NESTED_8d7e6f5a4b3c2d1e";

      try {
        assertNoPII({ meta: { data: { content: canary } } }, "test_table");
      } catch (error) {
        // Expected
      }

      const canaryFound = capturedLogs.some(log => log.includes(canary));
      expect(canaryFound).toBe(false);
    });

    it("should NEVER log canary string from array content", () => {
      const canary = "CANARY_ARRAY_9a8b7c6d5e4f3g2h";

      try {
        assertNoPII({ items: ["safe", canary, "safe"] }, "test_table");
      } catch (error) {
        // Expected
      }

      const canaryFound = capturedLogs.some(log => log.includes(canary));
      expect(canaryFound).toBe(false);
    });

    it("should verify ALL canary strings don't leak", () => {
      let allClean = true;

      for (const canary of canaryStrings) {
        capturedLogs.length = 0;

        try {
          assertNoPII({ note: canary }, "test_table");
        } catch (error) {
          // Expected
        }

        const canaryFound = capturedLogs.some(log => log.includes(canary));
        if (canaryFound) {
          allClean = false;
          console.error(`[B6] LEAK: Canary ${canary.slice(0, 20)}... found in logs`);
        }
      }

      expect(allClean).toBe(true);
    });
  });

  describe("Error message sanitization", () => {
    it("should never include raw value in error message", () => {
      const secretValue = "SECRET_VALUE_12345_DO_NOT_LEAK";

      let errorMessage = "";
      try {
        assertNoPII({ content: secretValue }, "test_table");
      } catch (error) {
        if (error instanceof PIIFirewallError) {
          errorMessage = error.message;
        }
      }

      // Error message should NOT contain the secret
      expect(errorMessage).not.toContain(secretValue);

      // But should indicate the violation
      expect(errorMessage).toContain("PII WRITE BLOCKED");
      expect(errorMessage).toContain("content");
    });

    it("should provide sanitized error response", () => {
      const secretValue = "MY_SECRET_DATA";

      let errorResponse: { error: string; code: string; key?: string } | null = null;
      try {
        assertNoPII({ text: secretValue }, "api_route");
      } catch (error) {
        if (error instanceof PIIFirewallError) {
          errorResponse = error.toResponse();
        }
      }

      expect(errorResponse).not.toBeNull();
      expect(errorResponse?.error).toBe("PII_WRITE_BLOCKED");
      expect(errorResponse?.key).toBe("text");
      // Response should NOT contain the secret
      expect(JSON.stringify(errorResponse)).not.toContain(secretValue);
    });
  });

  describe("Log guard functionality", () => {
    it("should verify error messages don't contain raw values", () => {
      const secretValue = "MY_SECRET_DATA_12345";

      let errorMessage = "";
      try {
        assertNoPII({ content: secretValue }, "test");
      } catch (error) {
        if (error instanceof PIIFirewallError) {
          errorMessage = error.message;
        }
      }

      // Error message should NOT contain the secret
      expect(errorMessage).not.toContain(secretValue);
      expect(errorMessage).toContain("PII WRITE BLOCKED");
    });
  });

  describe("Request log protection", () => {
    it("should simulate API request without logging body", () => {
      const requestBody = {
        content: "SECRET_USER_CONTENT_ABC123",
        text: "MORE_SECRET_DATA_XYZ789",
      };

      // Simulate API route that logs request
      capturedLogs.length = 0;

      // Safe logging (only logs metadata, not body)
      console.log(`[API] Request received: ${"POST"} ${"/api/test"}`);
      console.log(`[API] Content-Type: ${"application/json"}`);
      console.log(`[API] Content-Length: ${JSON.stringify(requestBody).length}`);

      // Trigger firewall (would happen in real route)
      try {
        assertNoPII(requestBody, "api_route");
      } catch (error) {
        console.error(`[API] PII blocked: ${(error as Error).message}`);
      }

      // Verify secrets are NOT in logs
      const allLogs = capturedLogs.join(" ");
      expect(allLogs).not.toContain("SECRET_USER_CONTENT_ABC123");
      expect(allLogs).not.toContain("MORE_SECRET_DATA_XYZ789");
    });
  });
});

// Test report
console.log("\n" + "=".repeat(70));
console.log("B6: LOGGING AND TRANSIENT TEXT PROOF - TEST SUITE");
console.log("=".repeat(70));
console.log(`Canary strings: ${canaryStrings.length}`);
console.log("Log channels tested: console.log, console.error, console.warn, console.info");
console.log("Protection: Error message sanitization, value exclusion");
console.log("=".repeat(70) + "\n");
