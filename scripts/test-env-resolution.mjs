import path from "node:path";
import envResolverModule from "./envRootResolver.js";

const { loadRootEnv, getRepoRoot, getRootEnvPath } = envResolverModule;

function log(message) {
  console.log(`[ENV:TEST] ${message}`);
}

function simulate(startDirLabel, startDirPath) {
  const repoRoot = getRepoRoot(startDirPath);
  const envPath = getRootEnvPath(repoRoot);
  loadRootEnv({ startDir: repoRoot, silent: true });
  log(`Simulation from ${startDirLabel} resolved env ${envPath}`);
  log(`DATA_DESIGN_ACK=${process.env.DATA_DESIGN_ACK ?? "<unset>"}`);
}

log("Verifying loadRootEnv sets DATA_DESIGN_ACK...");
loadRootEnv({ startDir: process.cwd(), silent: true });
log(`ACK after direct load: ${process.env.DATA_DESIGN_ACK ?? "<unset>"}`);

const repoRoot = getRepoRoot(process.cwd());
simulate("repo root", repoRoot);
simulate("MOBILE/", path.join(repoRoot, "MOBILE"));
simulate("scripts/", path.join(repoRoot, "scripts"));

