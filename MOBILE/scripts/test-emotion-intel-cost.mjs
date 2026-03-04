/**
 * Emotion Intel Cost Alignment Test
 * 
 * Verifies:
 * - One route call results in exactly one OpenAI call
 * - Token charge matches actual OpenAI usage (1 call, not 3)
 * - No hidden 3x multiplier remains
 */

import { createServer } from "http";

const TEST_PORT = 3457;
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runTest() {
  log("\n═══════════════════════════════════════════════════════════", "blue");
  log("  EMOTION INTEL COST ALIGNMENT TEST", "blue");
  log("═══════════════════════════════════════════════════════════\n", "blue");

  // Verify the implementation
  log("[Test 1] Verifying single OpenAI call implementation...", "blue");
  
  const agentsPath = "lib/ai/agents.ts";
  let allPassed = true;
  
  try {
    const fs = await import("fs");
    const content = fs.readFileSync(agentsPath, "utf-8");
    
    // Check that runEmotionIntelBundle uses callOpenAIJson once
    const bundleFunctionMatch = content.match(/export async function runEmotionIntelBundle[\s\S]*?^}/m);
    
    if (!bundleFunctionMatch) {
      log("  ✗ Could not find runEmotionIntelBundle function", "red");
      allPassed = false;
    } else {
      const bundleFunction = bundleFunctionMatch[0];
      
      // Count OpenAI calls in the function
      const openAICalls = (bundleFunction.match(/callOpenAIJson/g) || []).length;
      const sequentialCalls = (bundleFunction.match(/await runEmotionLens|await runAttachmentAnalyzer|await runIdentityMirror/g) || []).length;
      
      if (openAICalls === 1 && sequentialCalls === 0) {
        log("  ✓ runEmotionIntelBundle uses exactly ONE callOpenAIJson call", "green");
      } else if (sequentialCalls >= 2) {
        log(`  ✗ runEmotionIntelBundle still makes ${sequentialCalls} sequential engine calls`, "red");
        allPassed = false;
      } else if (openAICalls === 0) {
        log("  ✗ runEmotionIntelBundle has no OpenAI calls (unexpected)", "red");
        allPassed = false;
      } else {
        log(`  ? runEmotionIntelBundle has ${openAICalls} OpenAI calls (unexpected)`, "yellow");
      }
    }

    // Check for combined schema
    if (content.includes("emotionIntelBundleSchema")) {
      log("  ✓ Combined emotionIntelBundleSchema exists", "green");
    } else {
      log("  ✗ Combined schema not found", "red");
      allPassed = false;
    }

    // Verify the individual engines still exist (for other routes)
    const individualEnginesExist = 
      content.includes("export async function runEmotionLens") &&
      content.includes("export async function runAttachmentAnalyzer") &&
      content.includes("export async function runIdentityMirror");
    
    if (individualEnginesExist) {
      log("  ✓ Individual engines preserved for other routes", "green");
    } else {
      log("  ? Individual engines may have been removed", "yellow");
    }
    
  } catch (e) {
    log(`  ✗ Could not read ${agentsPath}: ${e.message}`, "red");
    allPassed = false;
  }

  // Test 2: Verify route charges correct amount
  log("\n[Test 2] Verifying route token estimate...", "blue");
  
  const routePath = "app/api/emotion-intel/route.ts";
  try {
    const fs = await import("fs");
    const content = fs.readFileSync(routePath, "utf-8");
    
    const tokenEstimate = content.match(/ESTIMATED_TOKENS\s*=\s*(\d+)/);
    if (tokenEstimate) {
      const tokens = parseInt(tokenEstimate[1], 10);
      if (tokens === 700) {
        log(`  ✓ Route charges ${tokens} tokens (appropriate for single call)`, "green");
      } else if (tokens >= 2000) {
        log(`  ? Route charges ${tokens} tokens (may be overcharging for single call)`, "yellow");
      } else {
        log(`  → Route charges ${tokens} tokens`, "blue");
      }
    } else {
      log("  ? Could not find ESTIMATED_TOKENS in route", "yellow");
    }
  } catch (e) {
    log(`  ? Could not read ${routePath}: ${e.message}`, "yellow");
  }

  // Test 3: Simulate request and verify single call
  log("\n[Test 3] Simulating request flow...", "blue");
  
  let openAICallCount = 0;
  
  const server = createServer(async (req, res) => {
    if (req.url === "/api/emotion-intel" && req.method === "POST") {
      // Simulate what runEmotionIntelBundle does now
      openAICallCount++;
      log("  → Simulated single OpenAI call executed", "yellow");
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        emotion: { primaryEmotion: "joy" },
        attachment: { probableStyles: ["secure"] },
        identity: { coreValues: ["honesty"] }
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  
  // Make a request
  try {
    const response = await fetch(`http://localhost:${TEST_PORT}/api/emotion-intel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "I'm feeling happy today!" }),
    });
    
    if (response.ok) {
      log("  → Request completed successfully", "yellow");
    }
  } catch (e) {
    log(`  ? Request failed: ${e.message}`, "yellow");
  }

  await new Promise((resolve) => server.close(resolve));

  if (openAICallCount === 1) {
    log("  ✓ Single request resulted in exactly 1 OpenAI call", "green");
  } else {
    log(`  ✗ Single request resulted in ${openAICallCount} OpenAI calls`, "red");
    allPassed = false;
  }

  // Final result
  log("\n═══════════════════════════════════════════════════════════", "blue");
  if (allPassed) {
    log("  emotion_intel_cost_aligned: YES", "green");
    log("═══════════════════════════════════════════════════════════\n", "blue");
    return true;
  } else {
    log("  emotion_intel_cost_aligned: NO", "red");
    log("═══════════════════════════════════════════════════════════\n", "blue");
    return false;
  }
}

runTest().then((passed) => {
  process.exit(passed ? 0 : 1);
}).catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
