import fs from "node:fs";
import path from "node:path";
import envResolverModule from "./envRootResolver.js";

const { getRepoRoot, getRootEnvPath, loadRootEnv } = envResolverModule;

const args = process.argv.slice(2);
const forceRoot = args.includes("--force-root");

let startDir = process.cwd();
if (path.basename(startDir).toLowerCase() === "mobile") {
  startDir = path.dirname(startDir);
  console.warn("[ENV:HARDEN] CWD corrected from MOBILE → repo root.");
}

const repoRoot = getRepoRoot(forceRoot ? startDir : startDir);
const rootEnvPath = getRootEnvPath(repoRoot);
const mobileEnvPath = path.join(repoRoot, "MOBILE", ".env.local");
const mobileEnvExists = fs.existsSync(mobileEnvPath);

let rootEnvExists = fs.existsSync(rootEnvPath);
if (!rootEnvExists) {
  console.warn("[ENV:HARDEN] Root .env.local not found.");
} else {
  loadRootEnv({ startDir: repoRoot, silent: true });
}

let dotenvModule;
let usedFallbackDotenv = false;
try {
  dotenvModule = await import("dotenv");
} catch {
  usedFallbackDotenv = true;
  console.warn("[ENV:HARDEN] dotenv package not found; using internal loader.");
  dotenvModule = {
    config: ({ path: envPath }) => {
      envResolverModule.loadRootEnv({ startDir: repoRoot, silent: true });
      return { parsed: true };
    },
  };
}

if (dotenvModule?.config) {
  dotenvModule.config({ path: rootEnvPath });
  if (rootEnvExists && process.env.NODE_ENV !== "production") {
    console.log(`[ENV:HARDEN] Root env loaded from ${rootEnvPath}`);
  }
}

if (mobileEnvExists) {
  console.warn(`[ENV:HARDEN] WARNING: ${mobileEnvPath} exists. Root .env.local is authoritative. MOBILE/.env.local will be ignored.`);
}

const ack = process.env.DATA_DESIGN_ACK;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction || ack === "true") {
  process.exit(0);
}

console.error(
  "[DATA-DESIGN] Please read DATA_DESIGN.md and set DATA_DESIGN_ACK=true in your env if you understand the storage rules.",
);
process.exit(1);