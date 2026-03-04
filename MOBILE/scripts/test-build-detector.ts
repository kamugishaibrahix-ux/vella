#!/usr/bin/env tsx
/**
 * BUILD-TIME DETECTOR PROOF (B1)
 * ==============================
 * CI-grade proof that the PII detector correctly identifies violations.
 *
 * This script:
 * 1. Creates a temporary file with a forbidden pattern
 * 2. Runs pnpm check:pii
 * 3. Asserts it FAILS
 * 4. Deletes the temp file
 * 5. Runs pnpm check:pii again
 * 6. Asserts it PASSES
 *
 * Output: artifacts/pii_detector_fail.log, artifacts/pii_detector_pass.log
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const TEMP_VIOLATION_FILE = path.resolve(__dirname, "../tests/pii/tmp_violation.ts");
const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts");
const FAIL_LOG = path.join(ARTIFACTS_DIR, "pii_detector_fail.log");
const PASS_LOG = path.join(ARTIFACTS_DIR, "pii_detector_pass.log");

// Forbidden pattern that should trigger the detector
const VIOLATION_CODE = `
// TEMPORARY VIOLATION FILE - DO NOT COMMIT
// This file intentionally contains a forbidden pattern for testing

import { supabase } from "@/lib/supabase/client";

export async function violationExample() {
  // This should be detected by the PII detector
  await supabase.from("journal_entries").insert({ content: "This is personal text that should not be stored" });
}
`;

function ensureArtifactsDir(): void {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
}

function createViolationFile(): void {
  fs.writeFileSync(TEMP_VIOLATION_FILE, VIOLATION_CODE, "utf-8");
  console.log("[B1] Created temporary violation file:", TEMP_VIOLATION_FILE);
}

function deleteViolationFile(): void {
  if (fs.existsSync(TEMP_VIOLATION_FILE)) {
    fs.unlinkSync(TEMP_VIOLATION_FILE);
    console.log("[B1] Deleted temporary violation file");
  }
}

function runDetector(): { success: boolean; output: string; exitCode: number } {
  try {
    const output = execSync("pnpm check:pii", {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output, exitCode: 0 };
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout || error.message || "",
      exitCode: error.status || 1,
    };
  }
}

function runTest(): void {
  console.log("\n" + "=".repeat(70));
  console.log("B1: BUILD-TIME DETECTOR PROOF");
  console.log("=".repeat(70) + "\n");

  ensureArtifactsDir();

  // PHASE 1: Create violation and expect FAILURE
  console.log("[PHASE 1] Creating violation file...");
  createViolationFile();

  console.log("[PHASE 1] Running detector (expecting FAILURE)...");
  const failResult = runDetector();

  // Write fail log
  const failLogContent = `
================================================================================
BUILD-TIME DETECTOR PROOF - EXPECTED FAILURE
================================================================================
Timestamp: ${new Date().toISOString()}
Test: Temporary violation file created
Expected Result: FAIL (exit code 1)
Actual Result: ${failResult.success ? "PASS (unexpected!)" : "FAIL (expected)"}
Exit Code: ${failResult.exitCode}

--- DETECTOR OUTPUT ---
${failResult.output}

--- VERIFICATION ---
${failResult.success ? "❌ TEST FAILED: Detector did not catch the violation!" : "✅ TEST PASSED: Detector correctly identified violation"}
================================================================================
`;
  fs.writeFileSync(FAIL_LOG, failLogContent, "utf-8");

  if (failResult.success) {
    console.error("❌ CRITICAL: Detector did NOT catch the violation!");
    deleteViolationFile();
    process.exit(1);
  }

  console.log("✅ Detector correctly identified the violation\n");

  // PHASE 2: Delete violation and expect SUCCESS
  console.log("[PHASE 2] Deleting violation file...");
  deleteViolationFile();

  console.log("[PHASE 2] Running detector (expecting PASS)...");
  const passResult = runDetector();

  // Write pass log
  const passLogContent = `
================================================================================
BUILD-TIME DETECTOR PROOF - EXPECTED PASS
================================================================================
Timestamp: ${new Date().toISOString()}
Test: Violation file removed
Expected Result: PASS (exit code 0)
Actual Result: ${passResult.success ? "PASS (expected)" : "FAIL (unexpected!)"}
Exit Code: ${passResult.exitCode}

--- DETECTOR OUTPUT ---
${passResult.output}

--- VERIFICATION ---
${passResult.success ? "✅ TEST PASSED: Detector correctly passed clean codebase" : "❌ TEST FAILED: Detector incorrectly flagged clean code"}
================================================================================
`;
  fs.writeFileSync(PASS_LOG, passLogContent, "utf-8");

  if (!passResult.success) {
    console.error("❌ CRITICAL: Detector failed on clean codebase!");
    console.error("Output:", passResult.output);
    process.exit(1);
  }

  console.log("✅ Detector correctly passed clean codebase\n");

  // Final summary
  console.log("=".repeat(70));
  console.log("B1: BUILD-TIME DETECTOR PROOF - ALL TESTS PASSED");
  console.log("=".repeat(70));
  console.log("Artifacts generated:");
  console.log("  -", FAIL_LOG);
  console.log("  -", PASS_LOG);
  console.log("=".repeat(70) + "\n");
}

// Run the test
runTest();
