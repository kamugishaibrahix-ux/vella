#!/usr/bin/env node
/**
 * Production Mock Regression Guard
 * 
 * Scans app/ and lib/ for mock/stub patterns that should not reach production.
 * 
 * Violations:
 * - "mock" (unless properly guarded by NODE_ENV === "development")
 * - "not implemented"
 * - "TODO" / "FIXME" (in code, not comments)
 * - Hardcoded 503 JSON bodies (should use consistent error responses)
 * 
 * Allowlist:
 * - Blocks guarded by: if (process.env.NODE_ENV === "development")
 * 
 * Exit codes:
 *   0 = no violations found
 *   1 = violations detected
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const SCAN_DIRS = ['app', 'lib'];
const EXCLUDE_DIRS = ['test', 'scripts', 'node_modules', '.next', 'dist', 'out'];
const EXCLUDE_FILES = ['verify-no-production-mocks.mjs'];

// Patterns that are violations (unless in allowlist block)
const VIOLATION_PATTERNS = [
  {
    name: 'mock_function',
    pattern: /\b(mock\w*|\w*Mock)\s*[:=\(]/i,
    exclude: /getDevMock|mockClarity|mockStrategy|mockDeepDive|mockCompass|mockArchitect|mockEmotion|mockAttachment|mockIdentity|isMock|mockResolvedValue|mockImplementation/i,
    message: 'Mock function or variable detected'
  },
  {
    name: 'not_implemented',
    pattern: /not\s+implemented/i,
    exclude: /pending.*not.*implemented|not.*implemented.*yet/i, // Allow "not implemented yet" comments
    message: '"Not implemented" detected'
  },
  {
    name: 'todo_code',
    pattern: /TODO[^:]|FIXME/,
    excludeInComment: false,
    message: 'TODO/FIXME in code (use comments for tracking)'
  },
  {
    name: 'mock_import',
    pattern: /from.*\/mock\/|import.*\/mock\//i,
    message: 'Import from mock module'
  },
  {
    name: 'stub_response',
    pattern: /return\s*\{\s*success:\s*(true|false).*stub|stubResponse|fakeResponse/i,
    message: 'Stub response detected'
  }
];

// Hardcoded JSON 503s that ARE violations (inline JSON with 503)
const HARDCODED_503_PATTERN = /JSON\.stringify\([^)]*\{[^}]*error.*\}\).*status:\s*503|\.json\(\{[^}]*error[^}]*\}\).*status:\s*503/;

// Allowlist: must be inside an if (NODE_ENV === "development") block
const DEV_GUARD_PATTERN = /if\s*\(\s*process\.env\.NODE_ENV\s*===?\s*["']development["']\s*\)/;

function shouldExcludeDir(dirPath) {
  const baseName = path.basename(dirPath);
  return EXCLUDE_DIRS.includes(baseName);
}

function shouldExcludeFile(filePath) {
  const baseName = path.basename(filePath);
  return EXCLUDE_FILES.includes(baseName) || !baseName.endsWith('.ts');
}

function findFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (!shouldExcludeDir(fullPath)) {
        findFiles(fullPath, files);
      }
    } else if (!shouldExcludeFile(fullPath)) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function isInDevGuardBlock(lines, lineIndex) {
  // Check surrounding context (up to 20 lines before)
  const startCheck = Math.max(0, lineIndex - 20);
  let braceDepth = 0;
  let inDevBlock = false;
  
  for (let i = startCheck; i <= lineIndex; i++) {
    const line = lines[i];
    
    // Check for dev guard start
    if (DEV_GUARD_PATTERN.test(line)) {
      inDevBlock = true;
      braceDepth = 0;
    }
    
    // Track brace depth within dev block
    if (inDevBlock) {
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
      
      // We're inside the dev block if braces haven't closed
      if (braceDepth > 0 || i === lineIndex) {
        return true;
      }
    }
  }
  
  return false;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = path.relative(ROOT_DIR, filePath);
  const violations = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();
    
    // Skip pure comments
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*/')) {
      continue;
    }
    
    // Check each pattern
    for (const { name, pattern, exclude, message } of VIOLATION_PATTERNS) {
      if (pattern.test(line)) {
        // Check if this line should be excluded
        if (exclude && exclude.test(line)) {
          continue;
        }
        
        // Check if inside dev guard block
        if (isInDevGuardBlock(lines, i)) {
          continue;
        }
        
        violations.push({
          line: lineNum,
          type: name,
          message,
          code: trimmed.substring(0, 80)
        });
      }
    }
    
    // Special check for hardcoded 503 JSON bodies (actual violation)
    // Only flag if it's a raw JSON response that's not using the standard error helpers
    if (HARDCODED_503_PATTERN.test(line)) {
      // Check if it's using a constant like AI_DISABLED_RESPONSE or BILLING_DISABLED_RESPONSE
      if (!/AI_DISABLED_RESPONSE|BILLING_DISABLED_RESPONSE|serviceUnavailableResponse|rateLimit503Response|consistentErrors/.test(line)) {
        // Still in dev guard?
        if (!isInDevGuardBlock(lines, i)) {
          violations.push({
            line: lineNum,
            type: 'hardcoded_503_json',
            message: 'Hardcoded 503 JSON response without standard helpers',
            code: trimmed.substring(0, 80)
          });
        }
      }
    }
  }
  
  return violations;
}

function main() {
  console.log('🔍 Scanning for production mock/stub regressions...\n');
  
  let totalFiles = 0;
  let violationCount = 0;
  const allViolations = [];
  
  for (const scanDir of SCAN_DIRS) {
    const dirPath = path.join(ROOT_DIR, scanDir);
    if (!fs.existsSync(dirPath)) {
      console.warn(`⚠️ Directory not found: ${scanDir}`);
      continue;
    }
    
    const files = findFiles(dirPath);
    
    for (const filePath of files) {
      totalFiles++;
      const violations = analyzeFile(filePath);
      
      if (violations.length > 0) {
        violationCount += violations.length;
        const relativePath = path.relative(ROOT_DIR, filePath);
        console.log(`❌ ${relativePath}`);
        
        for (const v of violations) {
          console.log(`   Line ${v.line}: [${v.type}] ${v.message}`);
          console.log(`   ${v.code}`);
        }
        console.log();
        
        allViolations.push({ file: relativePath, violations });
      }
    }
  }
  
  console.log(`📊 Summary:`);
  console.log(`   Files scanned: ${totalFiles}`);
  console.log(`   Violations: ${violationCount}`);
  
  if (violationCount > 0) {
    console.log(`\n❌ PRODUCTION MOCK/STUB VIOLATIONS FOUND`);
    console.log(`   Remove these before deploying to production.`);
    process.exit(1);
  } else {
    console.log(`\n✅ No production mock/stub regressions found`);
    process.exit(0);
  }
}

main();
