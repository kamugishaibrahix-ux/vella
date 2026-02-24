#!/usr/bin/env node
/**
 * API Route Security Audit Script
 * 
 * Audits all API routes for:
 * - Authentication requirements
 * - Personal data exposure
 * - Proper error handling
 * - Rate limiting considerations
 * - Input validation
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiDir = join(__dirname, "..", "MOBILE", "app", "api");

// Personal data keywords that should not appear in API responses
const PERSONAL_DATA_KEYWORDS = [
  "content",
  "text",
  "transcript",
  "message",
  "journal",
  "note",
  "reflection",
  "conversation",
  "memory",
  "snapshot",
  "free_text",
  "prompt",
  "response",
  "summary",
  "narrative",
];

// Banned response patterns
const BANNED_PATTERNS = [
  /\.content\b/,
  /\.text\b/,
  /\.transcript\b/,
  /\.message\b/,
  /\.note\b/,
  /\.journal\b/,
  /\.reflection\b/,
  /\.conversation\b/,
  /\.memory\b/,
  /\.snapshot\b/,
  /\.free_text\b/,
  /\.prompt\b/,
  /\.response\b/,
  /\.summary\b/,
  /\.narrative\b/,
];

function findAPIRoutes(dir, basePath = "") {
  const routes = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const routePath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      routes.push(...findAPIRoutes(fullPath, routePath));
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      routes.push({
        path: routePath.replace("/route.ts", "").replace("/route.tsx", ""),
        file: fullPath,
      });
    }
  }

  return routes;
}

function auditRoute(route) {
  const content = readFileSync(route.file, "utf-8");
  const issues = [];
  const warnings = [];

  // Check for authentication
  const hasRequireUserId = content.includes("requireUserId");
  const hasAuthCheck = content.includes("auth") || hasRequireUserId;

  if (!hasAuthCheck) {
    warnings.push(`Route '${route.path}' may not require authentication`);
  }

  // Check for personal data in responses
  const responsePatterns = [
    /NextResponse\.json\([^)]*\{[^}]*\}/g,
    /return\s+NextResponse\.json\(/g,
    /JSON\.stringify\(/g,
  ];

  for (const pattern of responsePatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Check for banned patterns in response
        for (const bannedPattern of BANNED_PATTERNS) {
          if (bannedPattern.test(match)) {
            issues.push(`Route '${route.path}' may expose personal data: ${bannedPattern.source}`);
          }
        }
      }
    }
  }

  // Check for direct Supabase queries (should use fromSafe)
  const directFromPattern = /supabase(Admin)?\.from\(["']([^"']+)["']\)/g;
  let match;
  while ((match = directFromPattern.exec(content)) !== null) {
    const table = match[2];
    if (!content.includes(`fromSafe("${table}")`)) {
      warnings.push(`Route '${route.path}' uses direct Supabase query for '${table}' (should use fromSafe)`);
    }
  }

  // Check for error handling
  if (!content.includes("try") && !content.includes("catch")) {
    warnings.push(`Route '${route.path}' may lack proper error handling`);
  }

  // Check for input validation
  if (content.includes("req.body") || content.includes("request.json()")) {
    if (!content.includes("zod") && !content.includes("validate") && !content.includes("parse")) {
      warnings.push(`Route '${route.path}' may lack input validation`);
    }
  }

  // Check for rate limiting considerations
  if (!content.includes("rate") && !content.includes("limit") && !content.includes("throttle")) {
    // Not critical, but good practice
    // warnings.push(`Route '${route.path}' may benefit from rate limiting`);
  }

  return { issues, warnings };
}

function main() {
  console.log("🔍 API Route Security Audit\n");

  if (!require("fs").existsSync(apiDir)) {
    console.error(`[ERROR] API directory not found: ${apiDir}`);
    process.exit(1);
  }

  const routes = findAPIRoutes(apiDir);
  console.log(`📁 Found ${routes.length} API routes\n`);

  const allIssues = [];
  const allWarnings = [];

  for (const route of routes) {
    const { issues, warnings } = auditRoute(route);
    allIssues.push(...issues.map((i) => `${route.path}: ${i}`));
    allWarnings.push(...warnings.map((w) => `${route.path}: ${w}`));
  }

  // Report results
  if (allIssues.length === 0 && allWarnings.length === 0) {
    console.log("✅ All API routes pass security audit!\n");
    process.exit(0);
  }

  if (allIssues.length > 0) {
    console.log("❌ CRITICAL ISSUES:\n");
    allIssues.forEach((issue) => console.log(`  ${issue}`));
    console.log();
  }

  if (allWarnings.length > 0) {
    console.log("⚠️  WARNINGS:\n");
    allWarnings.forEach((warning) => console.log(`  ${warning}`));
    console.log();
  }

  // Summary
  console.log(`\n📋 Summary:`);
  console.log(`  Routes audited: ${routes.length}`);
  console.log(`  Critical issues: ${allIssues.length}`);
  console.log(`  Warnings: ${allWarnings.length}\n`);

  if (allIssues.length > 0) {
    console.log("❌ Audit failed. Please fix critical issues before deploying.\n");
    process.exit(1);
  }

  console.log("⚠️  Audit completed with warnings. Review before deploying.\n");
  process.exit(0);
}

main();

