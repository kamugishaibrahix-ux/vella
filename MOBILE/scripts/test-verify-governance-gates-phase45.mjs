/**
 * Phase 4.5 Governance Gate Test
 *
 * Runs verify-governance-gates.mjs and asserts exit code 0.
 *
 * Usage: node MOBILE/scripts/test-verify-governance-gates-phase45.mjs
 *
 * Exit codes:
 *   0 = Verifier passed (all Phase 4.5 invariants hold)
 *   1 = Verifier failed (governance violations found)
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = join(__dirname, "..");
const VERIFIER_PATH = join(ROOT_DIR, "scripts", "verify-governance-gates.mjs");

function runVerifier() {
  return new Promise((resolve) => {
    const child = spawn("node", [VERIFIER_PATH], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });

    child.on("error", (err) => {
      resolve({ exitCode: -1, stdout, stderr: err.message });
    });
  });
}

async function main() {
  process.stdout.write("\n========================================\n");
  process.stdout.write("PHASE 4.5 GOVERNANCE GATE TEST\n");
  process.stdout.write("========================================\n\n");

  process.stdout.write("Running verify-governance-gates.mjs...\n\n");

  const result = await runVerifier();

  // Output the verifier's output
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.stdout.write("\n");

  if (result.exitCode === 0) {
    process.stdout.write("========================================\n");
    process.stdout.write("PASS: All governance gates verified\n");
    process.stdout.write("========================================\n");
    process.stdout.write("\nPhase 4.5 invariants enforced:\n");
    process.stdout.write("  • Registry completeness\n");
    process.stdout.write("  • RouteKey enforcement\n");
    process.stdout.write("  • Entitlement gate presence\n");
    process.stdout.write("  • Rate limit policy consistency\n");
    process.stdout.write("  • Ledger write firewall\n");
    process.stdout.write("  • Charge-before-spend order\n");
    process.stdout.write("  • Refund-on-failure patterns\n");
    process.stdout.write("  • Rate limit guard enforcement\n");
    process.exit(0);
  } else {
    process.stdout.write("========================================\n");
    process.stdout.write("FAIL: Governance verification failed\n");
    process.stdout.write("========================================\n");
    process.stdout.write(`\nExit code: ${result.exitCode}\n`);
    process.stdout.write("\nFix the reported issues before merging.\n");
    process.exit(1);
  }
}

main();
