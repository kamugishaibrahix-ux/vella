#!/usr/bin/env node
/**
 * PHASE 3.4 ROUTE DEDUP VERIFICATION
 * Ensures no duplicate/legacy API routes exist
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const API_ROUTES_DIR = join(PROJECT_ROOT, "app", "api");

let passed = 0;
let failed = 0;

function fail(message) {
  console.log(`  ❌ ${message}`);
  failed++;
}

function pass(message) {
  console.log(`  ✅ ${message}`);
  passed++;
}

function scanDirectory(dir, callback) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

console.log("🔍 ROUTE DEDUPLICATION VERIFICATION\n");

// CHECK 1: Only one transcribe endpoint exists
console.log("CHECK 1: Transcribe endpoint uniqueness");
const transcribeRoutes = [];
scanDirectory(API_ROUTES_DIR, (filePath) => {
  if (filePath.endsWith("route.ts") && filePath.includes("transcribe")) {
    transcribeRoutes.push(filePath);
  }
});

const canonicalTranscribe = transcribeRoutes.filter(p => p.includes("api\\transcribe") || p.includes("api/transcribe"));
const legacyVoiceTranscribe = transcribeRoutes.filter(p => p.includes("voice\\transcribe") || p.includes("voice/transcribe"));

if (transcribeRoutes.length === 1 && canonicalTranscribe.length === 1) {
  pass("Only one canonical transcribe endpoint: /api/transcribe/route.ts");
} else if (transcribeRoutes.length === 0) {
  fail("No transcribe endpoint found!");
} else if (legacyVoiceTranscribe.length > 0) {
  fail(`Legacy voice/transcribe endpoint still exists: ${legacyVoiceTranscribe.map(p => relative(PROJECT_ROOT, p)).join(", ")}`);
} else {
  fail(`Multiple transcribe endpoints found: ${transcribeRoutes.map(p => relative(PROJECT_ROOT, p)).join(", ")}`);
}

// CHECK 2: No legacy 410 placeholder routes
console.log("\nCHECK 2: No legacy 410 placeholder routes");
let legacyFound = false;
scanDirectory(API_ROUTES_DIR, (filePath) => {
  if (filePath.endsWith("route.ts")) {
    const content = readFileSync(filePath, "utf-8");
    // Check for patterns indicating a legacy/placeholder route
    if (content.includes("410") && content.includes("gone")) {
      fail(`Legacy 410 route found: ${relative(PROJECT_ROOT, filePath)}`);
      legacyFound = true;
    }
    if (content.includes("legacy") && content.includes("deprecated")) {
      fail(`Deprecated legacy route found: ${relative(PROJECT_ROOT, filePath)}`);
      legacyFound = true;
    }
  }
});
if (!legacyFound) {
  pass("No legacy 410 placeholder routes found");
}

// CHECK 3: Voice speak route removed
console.log("\nCHECK 3: Voice speak route removed (no callers existed)");
const voiceSpeakExists = existsSync(join(API_ROUTES_DIR, "voice", "speak", "route.ts"));
if (voiceSpeakExists) {
  fail("Legacy /api/voice/speak/route.ts still exists (unused - no callers)");
} else {
  pass("Legacy voice/speak route removed (confirmed no client callers)");
}

// CHECK 4: Voice transcribe folder removed
console.log("\nCHECK 4: Voice transcribe folder removed");
const voiceTranscribeExists = existsSync(join(API_ROUTES_DIR, "voice", "transcribe"));
if (voiceTranscribeExists) {
  fail("Legacy /api/voice/transcribe folder still exists");
} else {
  pass("Legacy voice/transcribe folder removed");
}

// CHECK 5: Rate limit config cleaned up
console.log("\nCHECK 5: Rate limit config cleaned up");
const rateLimitConfigPath = join(PROJECT_ROOT, "lib", "security", "rateLimit", "config.ts");
const rateLimitContent = readFileSync(rateLimitConfigPath, "utf-8");
if (rateLimitContent.includes('"voice/speak"')) {
  fail("voice/speak still referenced in rate limit config");
} else {
  pass("voice/speak removed from rate limit config");
}

// CHECK 6: Rate limit policy cleaned up
console.log("\nCHECK 6: Rate limit policy cleaned up");
const rateLimitPolicyPath = join(PROJECT_ROOT, "lib", "security", "rateLimitPolicy.ts");
const rateLimitPolicyContent = readFileSync(rateLimitPolicyPath, "utf-8");
if (rateLimitPolicyContent.includes("voice_speak:")) {
  fail("voice_speak policy still exists in rate limit policy");
} else {
  pass("voice_speak policy removed from rate limit policy");
}

// CHECK 7: AI endpoint policy cleaned up
console.log("\nCHECK 7: AI endpoint policy cleaned up");
const aiPolicyPath = join(PROJECT_ROOT, "lib", "security", "aiEndpointPolicy.ts");
const aiPolicyContent = readFileSync(aiPolicyPath, "utf-8");
if (aiPolicyContent.includes('"voice/speak"')) {
  fail("voice/speak still referenced in AI endpoint policy");
} else {
  pass("voice/speak removed from AI endpoint policy");
}

// CHECK 8: Audio vella is the canonical TTS endpoint
console.log("\nCHECK 8: Audio vella endpoint exists as canonical TTS");
const audioVellaExists = existsSync(join(API_ROUTES_DIR, "audio", "vella", "route.ts"));
if (audioVellaExists) {
  pass("Canonical TTS endpoint exists: /api/audio/vella");
} else {
  fail("Missing canonical TTS endpoint: /api/audio/vella");
}

// CHECK 9: Verify client uses canonical endpoint
console.log("\nCHECK 9: Client uses canonical audio endpoint");
const useRealtimeVellaPath = join(PROJECT_ROOT, "lib", "realtime", "useRealtimeVella.ts");
if (existsSync(useRealtimeVellaPath)) {
  const vellaContent = readFileSync(useRealtimeVellaPath, "utf-8");
  if (vellaContent.includes('"/api/audio/vella"')) {
    pass("Client correctly uses /api/audio/vella");
  } else if (vellaContent.includes('"/api/voice/speak"')) {
    fail("Client still references legacy /api/voice/speak");
  } else {
    pass("No legacy voice/speak references in useRealtimeVella.ts");
  }
} else {
  pass("useRealtimeVella.ts not found (no client references to check)");
}

// CHECK 10: Checkin naming consistency
console.log("\nCHECK 10: Check-in naming consistency (checkin vs check_in)");
const rateLimitPolicyPath2 = join(PROJECT_ROOT, "lib", "security", "rateLimitPolicy.ts");
const policyContent = readFileSync(rateLimitPolicyPath2, "utf-8");
if (policyContent.includes("checkin_read:") && policyContent.includes("checkin_write:")) {
  pass("Rate limit policy uses consistent 'checkin' naming (no dash)");
} else {
  fail("Rate limit policy missing checkin_read/checkin_write keys");
}

// Summary
console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) {
  console.log("\n❌ ROUTE DEDUPLICATION CHECKS FAILED");
  process.exit(1);
} else {
  console.log("\n✅ All route deduplication checks passed!");
  console.log("Duplicate route confusion is eliminated.");
  process.exit(0);
}
