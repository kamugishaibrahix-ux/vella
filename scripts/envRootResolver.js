const fs = require("node:fs");
const path = require("node:path");

function findRepoRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  let previous = null;

  while (current && current !== previous) {
    const packageJsonPath = path.join(current, "package.json");
    const supabasePath = path.join(current, "supabase");
    const hasMarkers = fs.existsSync(packageJsonPath) && fs.existsSync(supabasePath);
    if (hasMarkers) {
      if (path.basename(current).toLowerCase() === "mobile") {
        previous = current;
        current = path.dirname(current);
        continue;
      }
      return current;
    }
    previous = current;
    current = path.dirname(current);
  }

  return path.resolve(startDir);
}

function getRepoRoot(startDir) {
  const root = findRepoRoot(startDir);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[ENV:ROOT] Repo root resolved to ${root}`);
  }
  return root;
}

function getRootEnvPath(startDir) {
  const root = getRepoRoot(startDir);
  return path.join(root, ".env.local");
}

function parseEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line || !line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadRootEnv(options = {}) {
  const envPath = getRootEnvPath(options.startDir);
  parseEnvFile(envPath);
  if (!options.silent && process.env.NODE_ENV !== "production") {
    console.log(`[ENV:ROOT] Loaded environment from ${envPath}`);
  }
  return envPath;
}

module.exports = {
  getRepoRoot,
  getRootEnvPath,
  loadRootEnv,
};

