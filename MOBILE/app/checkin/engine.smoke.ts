/**
 * Engine Smoke Tests - Dev-only verification
 * Run: npx ts-node app/checkin/engine.smoke.ts
 */

import {
  addContract,
  deleteContract,
  countContracts,
  createEmptyState,
} from "./engine";
import { getUserAllowed, canAddUserContract, validateAddContract } from "./limits";
import type { WeeklyState } from "./types";

// Test runner
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}: ${e}`);
    failed++;
  }
}

function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected}, got ${actual}`);
  }
}

// Smoke tests
console.log("=== Engine Smoke Tests ===\n");

test("Can delete system contract", () => {
  let state = createEmptyState("2026-W08");
  const addResult = addContract(state, {
    title: "System Test",
    focusArea: "self-mastery",
    origin: "system",
  });
  if (!addResult.success) throw new Error("Failed to add system contract");
  state = addResult.state;
  
  const systemId = state.contracts[0].id;
  const deleteResult = deleteContract(state, systemId);
  
  assertEqual(deleteResult.success, true, "Should delete system contract");
  if (deleteResult.success) {
    assertEqual(deleteResult.state.contracts.length, 0, "Contract should be removed");
  }
});

test("Limits block adding 7th total contract", () => {
  let state = createEmptyState("2026-W08");
  // Add 6 contracts (mix of origins)
  for (let i = 0; i < 3; i++) {
    const r1 = addContract(state, { title: `System ${i}`, focusArea: "test", origin: "system" });
    if (!r1.success) throw new Error("Setup failed");
    state = r1.state;
    
    const r2 = addContract(state, { title: `User ${i}`, focusArea: "test", origin: "user" });
    if (!r2.success) throw new Error("Setup failed");
    state = r2.state;
  }
  
  assertEqual(state.contracts.length, 6, "Should have 6 contracts");
  
  // Try to add 7th
  const result = addContract(state, { title: "Extra", focusArea: "test", origin: "user" });
  assertEqual(result.success, false, "Should block 7th contract");
});

test("Limits block adding 6th system contract", () => {
  let state = createEmptyState("2026-W08");
  // Add 5 system contracts
  for (let i = 0; i < 5; i++) {
    const r = addContract(state, { title: `System ${i}`, focusArea: "test", origin: "system" });
    if (!r.success) throw new Error("Setup failed");
    state = r.state;
  }
  
  const counts = countContracts(state.contracts);
  assertEqual(counts.vellaCount, 5, "Should have 5 system");
  
  // Try to add 6th system
  const result = addContract(state, { title: "Extra System", focusArea: "test", origin: "system" });
  assertEqual(result.success, false, "Should block 6th system");
});

test("userAllowed updates as vellaCount changes", () => {
  // 0 system = 5 user allowed (but capped at 5)
  assertEqual(getUserAllowed(0), 5, "0 system -> 5 user");
  // 1 system = 5 user allowed (6-1=5)
  assertEqual(getUserAllowed(1), 5, "1 system -> 5 user");
  // 2 system = 4 user allowed (6-2=4)
  assertEqual(getUserAllowed(2), 4, "2 system -> 4 user");
  // 5 system = 1 user allowed (6-5=1)
  assertEqual(getUserAllowed(5), 1, "5 system -> 1 user");
});

test("canAddUserContract respects userAllowed", () => {
  // With 2 system contracts, userAllowed = 4
  assertEqual(canAddUserContract(2, 3), true, "3/4 user contracts - can add");
  assertEqual(canAddUserContract(2, 4), false, "4/4 user contracts - cannot add");
  assertEqual(canAddUserContract(2, 5), false, "5/4 user contracts - cannot add");
});

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
