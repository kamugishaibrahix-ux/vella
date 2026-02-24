const { createReadStream } = require("node:fs");
const { readdir } = require("node:fs/promises");
const { extname, relative, resolve } = require("node:path");
const readline = require("node:readline");

const ROOT = process.cwd();
const EXCLUDED = new Set([
  "node_modules",
  ".next",
  "build",
  "dist",
  "supabase/migrations",
  "scripts/checkForbiddenPatterns.ts",
]);
// Files with type/param names like text: string that trigger false positives (no Supabase writes)
const EXCLUDED_FILES = new Set([
  "lib/memory/chunking.ts",
  "lib\\memory\\chunking.ts",
  "lib/realtime/cadenceEngine.ts",
  "lib\\realtime\\cadenceEngine.ts",
]);

const FILE_EXTENSIONS = new Set([".ts", ".tsx"]);

const SUPABASE_KEYWORDS = ["safeInsert", "safeUpdate", "safeUpsert", ".insert", ".update", ".upsert"];

const PATTERNS = [
  // A) Free-text inside Supabase operations
  { label: "supabase.from(\"chat\")", regex: /supabase\.from\(\s*["'`]chat["'`]\s*\)/ },
  { label: "supabase.from(\"journals\")", regex: /supabase\.from\(\s*["'`]journals["'`]\s*\)/ },
  { label: "supabase.from(\"notes\")", regex: /supabase\.from\(\s*["'`]notes["'`]\s*\)/ },
  { label: "supabase.from(\"messages\")", regex: /supabase\.from\(\s*["'`]messages["'`]\s*\)/ },
  { label: "supabase.from(\"history\")", regex: /supabase\.from\(\s*["'`]history["'`]\s*\)/ },
  { label: "insert: { content:", regex: /insert\s*:\s*\{\s*content\s*:/ },
  { label: "insert: { text:", regex: /insert\s*:\s*\{\s*text\s*:/ },
  { label: "update: { content:", regex: /update\s*:\s*\{\s*content\s*:/ },
  { label: "update: { text:", regex: /update\s*:\s*\{\s*text\s*:/ },
  // B) Illegal columns
  { label: "content:", regex: /\bcontent\s*:/, requiresSupabaseContext: true },
  { label: "text:", regex: /\btext\s*:/, requiresSupabaseContext: true },
  { label: "summary:", regex: /\bsummary\s*:/, requiresSupabaseContext: true },
  { label: "free_text", regex: /\bfree_text\b/, requiresSupabaseContext: true },
  { label: "transcript", regex: /\btranscript\b/, requiresSupabaseContext: true },
  // C) Realtime violations
  { label: "sendText(\"", regex: /sendText\s*\(\s*["'`]/ },
  { label: "type: \"input_text\"", regex: /type\s*:\s*["'`]input_text["'`]/ },
  { label: "input_text literal", regex: /\binput_text\b/ },
  // D) Prompts/responses
  { label: "\"prompt\":", regex: /["'`]prompt["'`]\s*:/, requiresSupabaseContext: true },
  { label: "\"response\":", regex: /["'`]response["'`]\s*:/, requiresSupabaseContext: true },
];

async function walk(dir, results = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = relative(ROOT, resolve(dir, entry.name));
    if (EXCLUDED.has(entry.name) || EXCLUDED.has(relPath)) {
      continue;
    }
    if (entry.isDirectory()) {
      await walk(resolve(dir, entry.name), results);
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (FILE_EXTENSIONS.has(ext)) {
        results.push(resolve(dir, entry.name));
      }
    }
  }
  return results;
}

async function scanFile(filePath) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  let supabaseContext = 0;
  for await (const line of rl) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (SUPABASE_KEYWORDS.some((keyword) => trimmed.includes(keyword))) {
      supabaseContext = 5;
    } else if (supabaseContext > 0) {
      supabaseContext -= 1;
    }
    for (const pattern of PATTERNS) {
      if (pattern.requiresSupabaseContext && supabaseContext <= 0) {
        continue;
      }
      if (pattern.regex.test(line)) {
        console.error("[DATA-ENFORCER] Forbidden data pattern detected");
        console.error(`${relative(ROOT, filePath)}:${lineNumber}: ${line.trim()}`);
        return true;
      }
    }
  }
  return false;
}

async function main() {
  const files = (await walk(ROOT)).filter(
    (f) => !EXCLUDED_FILES.has(relative(ROOT, f).replace(/\\/g, "/"))
  );
  for (const file of files) {
    if (await scanFile(file)) {
      process.exit(1);
    }
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("[DATA-ENFORCER] checker failed", error);
  process.exit(1);
});


