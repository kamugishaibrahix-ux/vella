/**
 * CI Guard: Service Role Key Usage Boundary Check
 *
 * Ensures SUPABASE_SERVICE_ROLE_KEY is only referenced in server-only contexts:
 *   - app/api/**
 *   - lib/supabase/admin*
 *   - scripts/**
 *
 * Fails if any client-importable file references the service role key.
 */

import * as fs from "fs";
import * as path from "path";

const MOBILE_ROOT = path.resolve(__dirname, "..");
const CONTROL_ROOT = path.resolve(__dirname, "../../apps/vella-control");

const FORBIDDEN_PATTERNS = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /serviceRoleKey/,
  /service_role_key/,
];

const ALLOWED_SERVER_PATHS = [
  /[/\\]app[/\\]api[/\\]/,
  /[/\\]lib[/\\]supabase[/\\]admin/,
  /[/\\]lib[/\\]server[/\\]/,
  /[/\\]lib[/\\]auth[/\\]/,
  /[/\\]lib[/\\]security[/\\]/,
  /[/\\]scripts[/\\]/,
  /[/\\]supabase[/\\]/,
  /[/\\]test[/\\]/,
];

const IGNORED_DIRS = ["node_modules", ".next", "dist", ".git", ".turbo"];
const IGNORED_EXTENSIONS = [".md", ".json", ".lock", ".log", ".css", ".svg", ".png", ".jpg", ".ico"];
const IGNORED_FILENAMES = [".env", ".env.local", ".env.development", ".env.production", ".env.test", ".env.example"];

function isIgnored(filePath: string): boolean {
  if (IGNORED_DIRS.some(d => filePath.includes(`${path.sep}${d}${path.sep}`) || filePath.includes(`/${d}/`))) return true;
  const basename = path.basename(filePath);
  if (IGNORED_FILENAMES.includes(basename) || basename.startsWith(".env")) return true;
  return false;
}

function isAllowedServerPath(filePath: string): boolean {
  return ALLOWED_SERVER_PATHS.some(p => p.test(filePath));
}

function walkDir(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.includes(entry.name)) {
        walkDir(fullPath, files);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!IGNORED_EXTENSIONS.includes(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

interface Violation {
  file: string;
  line: number;
  match: string;
  pattern: string;
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(lines[i])) {
        violations.push({
          file: filePath,
          line: i + 1,
          match: lines[i].trim().slice(0, 120),
          pattern: pattern.source,
        });
      }
    }
  }
  return violations;
}

function main(): void {
  const roots = [MOBILE_ROOT, CONTROL_ROOT];
  const allFiles: string[] = [];
  for (const root of roots) {
    walkDir(root, allFiles);
  }

  const clientViolations: Violation[] = [];
  const serverUsages: Violation[] = [];

  for (const file of allFiles) {
    if (isIgnored(file)) continue;
    const violations = scanFile(file);
    if (violations.length === 0) continue;

    if (isAllowedServerPath(file)) {
      serverUsages.push(...violations);
    } else {
      clientViolations.push(...violations);
    }
  }

  console.log(`[service-role-guard] Scanned ${allFiles.length} files`);
  console.log(`[service-role-guard] Server-only references: ${serverUsages.length} (OK)`);

  if (clientViolations.length > 0) {
    console.error(`\n[service-role-guard] FAIL: ${clientViolations.length} client-side service role references found:\n`);
    for (const v of clientViolations) {
      const rel = path.relative(path.resolve(__dirname, "../.."), v.file);
      console.error(`  ${rel}:${v.line} — ${v.match}`);
    }
    console.error("\nService role key must only be referenced in server-only contexts.");
    console.error("Allowed paths: app/api/**, lib/supabase/admin*, lib/server/**, scripts/**");
    process.exit(1);
  }

  console.log("[service-role-guard] PASS: No client-side service role references.");
}

main();
