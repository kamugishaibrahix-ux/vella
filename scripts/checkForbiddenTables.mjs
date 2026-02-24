import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const ROOTS = ["MOBILE", "lib"];
const FORBIDDEN = [
  "journals",
  "journal_entries",
  "conversation_messages",
  "checkins",
  "emotional_logs",
  "stories",
  "traits",
  "insights",
];

async function walk(dir, matches = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, matches);
    } else if (entry.isFile()) {
      const content = await readFile(fullPath, "utf8");
      for (const token of FORBIDDEN) {
        if (content.includes(token)) {
          matches.push({ path: fullPath, token });
          break;
        }
      }
    }
  }
  return matches;
}

async function main() {
  const root = process.cwd();
  const violations = [];

  for (const rel of ROOTS) {
    const dir = resolve(root, rel);
    try {
      await walk(dir, violations);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      const relPath = relative(root, v.path);
      console.error(`[SAFE-DATA] Forbidden table reference detected in ${relPath}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[SAFE-DATA] checker failed", error);
  process.exit(1);
});


