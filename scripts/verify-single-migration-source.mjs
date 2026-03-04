#!/usr/bin/env node
/**
 * verify-single-migration-source.mjs
 * CI guardrail: ensures only supabase/migrations/ is used for migrations.
 * - Fails if MOBILE/supabase/migrations exists
 * - Fails if any .sql file exists under MOBILE/supabase/
 * - Prints PASS otherwise
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const mobileSupabase = path.join(repoRoot, 'MOBILE', 'supabase');

function findSqlFiles(dir, acc = [], excludeDirName = 'runbook-sql') {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && e.name === excludeDirName) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findSqlFiles(full, acc, excludeDirName);
    else if (e.name.endsWith('.sql')) acc.push(path.relative(repoRoot, full));
  }
  return acc;
}

let failed = false;

if (fs.existsSync(path.join(repoRoot, 'MOBILE', 'supabase', 'migrations'))) {
  console.error('FAIL: MOBILE/supabase/migrations exists. Use only supabase/migrations/ as canonical source.');
  failed = true;
}

const sqlInMobile = findSqlFiles(mobileSupabase);
if (sqlInMobile.length > 0) {
  console.error('FAIL: .sql files under MOBILE/supabase/:');
  sqlInMobile.forEach((f) => console.error('  ', f));
  failed = true;
}

if (failed) process.exit(1);
console.log('PASS');
process.exit(0);
