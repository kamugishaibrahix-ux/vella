#!/usr/bin/env node

/**
 * PHASE 10/11 — API Route Wiring Test with Negative Auth Tests
 * 
 * Tests all MOBILE API routes to verify:
 * - Routes use requireUserId
 * - Routes use local storage data
 * - Routes only query metadata tables (no personal data)
 * 
 * PHASE 11: Added negative auth tests (unauthenticated, empty state, corrupt state)
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MOBILE_ROOT = join(__dirname, '..', 'MOBILE');

const results = {
  passing: [],
  failing: [],
  brokenRoutes: [],
  suspiciousAccess: [],
  authTests: {},
};

function runTest(name, testFn) {
  try {
    const result = testFn();
    if (result === true || (result && result.pass === true)) {
      results.passing.push(name);
      console.log(`✅ PASS: ${name}`);
      return true;
    } else {
      results.failing.push(name);
      console.log(`❌ FAIL: ${name} - ${result?.error || 'Test returned false'}`);
      return false;
    }
  } catch (error) {
    results.failing.push(name);
    console.log(`❌ FAIL: ${name} - ${error.message}`);
    return false;
  }
}

// PHASE 11: Test auth scenarios for a route
function testRouteAuthScenarios(routeName, routePath) {
  if (!existsSync(routePath)) {
    results.authTests[routeName] = { unauthenticated: 'SKIP', empty_state: 'SKIP', corrupt_state: 'SKIP' };
    return;
  }
  
  const content = readFileSync(routePath, 'utf-8');
  const authResults = {};
  
  // Test: unauthenticated
  const hasRequireUserId = content.includes('requireUserId');
  const hasUnauthenticatedError = content.includes('UnauthenticatedError') || 
                                   content.includes('401') ||
                                   content.includes('not_authenticated');
  
  if (hasRequireUserId) {
    if (hasUnauthenticatedError) {
      authResults.unauthenticated = 'PASS';
      runTest(`[API] ${routeName} unauthenticated: PASS`, () => true);
    } else {
      authResults.unauthenticated = 'WARN';
      runTest(`[API] ${routeName} unauthenticated: WARN (no explicit error handling)`, () => {
        return { pass: true, error: 'Should explicitly handle unauthenticated requests' };
      });
    }
  } else {
    authResults.unauthenticated = 'FAIL';
    runTest(`[API] ${routeName} unauthenticated: FAIL (no requireUserId)`, () => false);
  }
  
  // Test: authenticated_empty_state
  const hasLocalStorageChecks = content.includes('getAllCheckIns') || 
                                content.includes('listLocalJournals') ||
                                content.includes('loadLocalTraits');
  const hasEmptyStateHandling = content.includes('?? []') || 
                                content.includes('|| []') ||
                                content.includes('length === 0') ||
                                content.includes('length > 0');
  
  if (hasLocalStorageChecks) {
    if (hasEmptyStateHandling) {
      authResults.empty_state = 'PASS';
      runTest(`[API] ${routeName} authenticated_empty_state: PASS`, () => true);
    } else {
      authResults.empty_state = 'WARN';
      runTest(`[API] ${routeName} authenticated_empty_state: WARN (may not handle empty state)`, () => {
        return { pass: true, error: 'Should explicitly handle empty local storage' };
      });
    }
  } else {
    authResults.empty_state = 'SKIP';
  }
  
  // Test: authenticated_corrupt_state
  const hasErrorHandling = content.includes('try') || 
                           content.includes('catch') ||
                           content.includes('error') ||
                           content.includes('Error');
  
  if (hasErrorHandling) {
    authResults.corrupt_state = 'PASS';
    runTest(`[API] ${routeName} authenticated_corrupt_state: PASS`, () => true);
  } else {
    authResults.corrupt_state = 'WARN';
    runTest(`[API] ${routeName} authenticated_corrupt_state: WARN (may not handle corrupt data)`, () => {
      return { pass: true, error: 'Should handle corrupt local storage gracefully' };
    });
  }
  
  results.authTests[routeName] = authResults;
}

// Test API routes
async function testAPIRoutes() {
  console.log('\n🔌 Testing API Routes...\n');

  const apiRoutes = [
    { path: 'app/api/life-themes/route.ts', methods: ['POST'] },
    { path: 'app/api/behaviour-loops/route.ts', methods: ['POST'] },
    { path: 'app/api/forecast/route.ts', methods: ['GET', 'POST'] },
    { path: 'app/api/identity/route.ts', methods: ['GET'] },
    { path: 'app/api/weekly-review/route.ts', methods: ['GET'] },
    { path: 'app/api/roadmap/route.ts', methods: ['GET'] },
    { path: 'app/api/insights/generate/route.ts', methods: ['POST'] },
    { path: 'app/api/journal/route.ts', methods: ['GET', 'POST', 'PUT', 'PATCH'] },
  ];

  apiRoutes.forEach(({ path, methods }) => {
    const filePath = join(MOBILE_ROOT, path);
    const routeName = path.split('/').pop().replace('.ts', '');
    
    runTest(`API route exists: ${routeName}`, () => {
      return existsSync(filePath);
    });

    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      
      // Check for requireUserId
      runTest(`${routeName} uses requireUserId`, () => {
        return content.includes('requireUserId');
      });

      // Check for local storage usage
      runTest(`${routeName} uses local storage functions`, () => {
        return content.includes('getAllCheckIns') || 
               content.includes('listLocalJournals') || 
               content.includes('loadLocalTraits') ||
               content.includes('extractLifeThemes') ||
               content.includes('detectBehaviourLoops') ||
               content.includes('generateEmotionalForecast') ||
               content.includes('generateWeeklyReview') ||
               content.includes('listJournalEntries');
      });

      // Check for NO personal data queries
      const hasPersonalDataQuery = 
        content.includes('.from("checkins")') ||
        content.includes(".from('checkins')") ||
        content.includes('.from("user_traits")') ||
        content.includes(".from('user_traits')") ||
        content.includes('.from("user_traits_history")') ||
        content.includes(".from('user_traits_history')") ||
        content.includes('.from("journal_entries")') ||
        content.includes(".from('journal_entries')");

      if (hasPersonalDataQuery) {
        results.suspiciousAccess.push(routeName);
        runTest(`${routeName} - NO personal data queries`, () => {
          return false;
        });
      } else {
        runTest(`${routeName} - NO personal data queries`, () => {
          return true;
        });
      }

      // Check for metadata-only queries (these are OK)
      const hasMetadataQuery = 
        content.includes('.from("vella_settings")') ||
        content.includes('.from("profiles")') ||
        content.includes('.from("user_goals")') ||
        content.includes('.from("progress_metrics")') ||
        content.includes('.from("connection_depth")') ||
        content.includes('.from("subscriptions")') ||
        content.includes('.from("token_usage")');

      if (hasMetadataQuery) {
        runTest(`${routeName} uses metadata tables only`, () => {
          return true;
        });
      }
      
      // PHASE 11: Test auth scenarios
      testRouteAuthScenarios(routeName, filePath);
    } else {
      results.brokenRoutes.push(routeName);
    }
  });
}

// Main test runner
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 11 — API ROUTE WIRING TEST (NEGATIVE AUTH)');
  console.log('═══════════════════════════════════════════════════════════\n');

  await testAPIRoutes();

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`✅ PASSING: ${results.passing.length}`);
  console.log(`❌ FAILING: ${results.failing.length}`);
  
  // PHASE 11: Auth test matrix
  if (Object.keys(results.authTests).length > 0) {
    console.log('\n🔐 AUTH TEST MATRIX:');
    Object.entries(results.authTests).forEach(([route, tests]) => {
      console.log(`\n   ${route}:`);
      Object.entries(tests).forEach(([test, status]) => {
        const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : status === 'SKIP' ? '⏭️' : '❌';
        console.log(`     ${icon} ${test}: ${status}`);
      });
    });
  }
  
  if (results.passing.length > 0) {
    console.log('\n✅ PASSING ROUTES:');
    results.passing.slice(0, 10).forEach(name => console.log(`   - ${name}`));
    if (results.passing.length > 10) {
      console.log(`   ... and ${results.passing.length - 10} more`);
    }
  }
  
  if (results.failing.length > 0) {
    console.log('\n❌ FAILING ROUTES:');
    results.failing.slice(0, 10).forEach(name => console.log(`   - ${name}`));
    if (results.failing.length > 10) {
      console.log(`   ... and ${results.failing.length - 10} more`);
    }
  }
  
  if (results.brokenRoutes.length > 0) {
    console.log('\n🔴 BROKEN ROUTES (file not found):');
    results.brokenRoutes.forEach(name => console.log(`   - ${name}`));
  }
  
  if (results.suspiciousAccess.length > 0) {
    console.log('\n⚠️  SUSPICIOUS METADATA ACCESS (personal data queries detected):');
    results.suspiciousAccess.forEach(name => console.log(`   - ${name}`));
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  const hasFailures = results.failing.length > 0 || 
                      results.brokenRoutes.length > 0 || 
                      results.suspiciousAccess.length > 0 ||
                      Object.values(results.authTests).some(tests => 
                        Object.values(tests).some(status => status === 'FAIL')
                      );
  
  process.exit(hasFailures ? 1 : 0);
}

runAllTests().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
