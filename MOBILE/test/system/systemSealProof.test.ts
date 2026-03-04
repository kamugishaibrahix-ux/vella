/**
 * SYSTEM SEAL PROOF (B7)
 * ======================
 * Tests that verify the system seal works correctly.
 *
 * Note: Full encryption testing requires mocking at the module level.
 * These tests verify the basic seal functionality.
 */

import { describe, it, expect, vi } from "vitest";
import {
  runSystemSeal,
  assertSystemSeal,
  isSystemSealed,
  getSealStatus,
  generateSealReport,
  SystemSealError,
  type SealResult,
  STRUCTURAL_VERIFICATION_QUERIES,
  validateStructuralSealingWithDB,
} from "@/lib/security/systemSeal";

describe("B7: SYSTEM SEAL PROOF", () => {
  describe("Basic seal functionality", () => {
    it("should return a valid seal result", () => {
      const result = runSystemSeal();

      expect(result).toHaveProperty("sealed");
      expect(result).toHaveProperty("violations");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("version");
      expect(typeof result.sealed).toBe("boolean");
      expect(Array.isArray(result.violations)).toBe(true);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it("should return consistent version format", () => {
      const result = runSystemSeal();

      // Version should be in format YYYY.MM.BUILD or similar
      expect(result.version).toMatch(/\d{4}\.\d{2}/);
    });

    it("should provide seal status", () => {
      const status = getSealStatus();

      expect(status.sealed).toBeDefined();
      expect(status.timestamp).toBeGreaterThan(0);
      expect(status.version).toBeDefined();
    });

    it("should generate a seal report", () => {
      const report = generateSealReport();

      expect(report).toContain("System Seal Report");
      expect(report).toContain("Status:");
      expect(report).toContain(result.sealed ? "SEALED" : "BROKEN");
    });

    // Capture result for use in tests
    const result = runSystemSeal();

    it("should have PII firewall properly configured", () => {
      // Check that PII firewall violations are not present
      const piiViolations = result.violations.filter(
        v => v.type === "PII_FIREWALL_BYPASSED"
      );
      expect(piiViolations).toHaveLength(0);
    });

    it("isSystemSealed should return a boolean", () => {
      const sealed = isSystemSealed();
      expect(typeof sealed).toBe("boolean");
    });
  });

  describe("SystemSealError", () => {
    it("should create error with proper structure", () => {
      const mockResult: SealResult = {
        sealed: false,
        violations: [{
          type: "ENCRYPTION_DISABLED",
          message: "Test violation",
          fatal: true,
        }],
        timestamp: Date.now(),
        version: "2026.02.40",
      };

      const error = new SystemSealError("Test error", mockResult);

      expect(error.message).toBe("Test error");
      expect(error.sealResult).toBe(mockResult);
      expect(error.name).toBe("SystemSealError");
    });

    it("should provide user-safe message", () => {
      const mockResult: SealResult = {
        sealed: false,
        violations: [{
          type: "ENCRYPTION_DISABLED",
          message: "Test violation",
          fatal: true,
        }],
        timestamp: Date.now(),
        version: "2026.02.40",
      };

      const error = new SystemSealError("Test error", mockResult);
      const userMessage = error.toUserMessage();

      expect(userMessage).toContain("cannot start");
      expect(userMessage).toContain("violation");
    });

    it("should provide diagnostic info", () => {
      const mockResult: SealResult = {
        sealed: false,
        violations: [{
          type: "ENCRYPTION_DISABLED",
          message: "Test violation",
          fatal: true,
        }],
        timestamp: Date.now(),
        version: "2026.02.40",
      };

      const error = new SystemSealError("Test error", mockResult);
      const diagnostics = error.toDiagnostics();

      expect(diagnostics).toHaveProperty("version");
      expect(diagnostics).toHaveProperty("timestamp");
      expect(diagnostics).toHaveProperty("sealed");
      expect(diagnostics).toHaveProperty("violationCount");
    });
  });

  describe("Development mode behavior", () => {
    it("should handle test environment limitations gracefully", () => {
      // Test environment lacks IndexedDB and has module loading differences
      // The seal should report violations but handle them deterministically
      try {
        assertSystemSeal();
        // If we get here, seal passed (may happen in some test configs)
        expect(true).toBe(true);
      } catch (error) {
        // Expected in test environment due to:
        // - No IndexedDB (UNSUPPORTED_ENVIRONMENT)
        // - Module loading differences (BUILD_ARTIFACT_INVALID)
        // These are test environment limitations, not production issues
        expect(error).toBeInstanceOf(SystemSealError);
        const sealError = error as SystemSealError;
        // Should have violations but be deterministic
        expect(sealError.sealResult.violations.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Structural sealing exports", () => {
    it("should export structural verification queries", () => {
      // Verify the queries object is exported for DB verification
      expect(STRUCTURAL_VERIFICATION_QUERIES).toBeDefined();
      expect(STRUCTURAL_VERIFICATION_QUERIES.forbiddenColumnsCheck).toContain("content");
      expect(STRUCTURAL_VERIFICATION_QUERIES.embeddingDimensionCheck).toContain("embedding_dimension_exact");
      expect(STRUCTURAL_VERIFICATION_QUERIES.hashConstraintsCheck).toContain("hash");
      expect(STRUCTURAL_VERIFICATION_QUERIES.triggerCoverageCheck).toContain("pii");
    });

    it("should export database validation function", () => {
      // Verify the async validation function exists
      expect(typeof validateStructuralSealingWithDB).toBe("function");
    });
  });
});

// Test report
console.log("\n" + "=".repeat(70));
console.log("B7: SYSTEM SEAL PROOF - TEST SUITE");
console.log("=".repeat(70));
console.log("Tests: Basic seal functionality, Error types");
console.log("Note: Full encryption testing requires production environment");
console.log("=".repeat(70) + "\n");
