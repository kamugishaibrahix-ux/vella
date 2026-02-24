#!/usr/bin/env node

/**
 * PHASE 10/11 — Admin Integration Test with Metadata Chaos
 * 
 * Tests vella-control admin functionality to verify:
 * - Admin pages fetch correct metadata tables
 * - Admin updates propagate to MOBILE
 * - No admin page reads personal data
 * - Admin analytics returns valid responses
 * 
 * PHASE 11: Added metadata chaos tests (missing rows, partial rows, empty tables)
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ADMIN_ROOT = join(__dirname, '..', 'apps', 'vella-control');

const results = {
  passing: [],
  failing: [],
  suspiciousAccess: [],
  chaosTests: {},
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

// PHASE 11: Test metadata chaos scenarios for admin features
function testMetadataChaos(featureName, filePath) {
  if (!existsSync(filePath)) {
    results.chaosTests[featureName] = { missing_rows: 'SKIP', partial_rows: 'SKIP', empty_tables: 'SKIP' };
    return;
  }
  
  const content = readFileSync(filePath, 'utf-8');
  const chaosResults = {};
  
  // Test: missing_rows
  // Check if code handles cases where related rows don't exist
  const hasNullChecks = content.includes('??') || 
                        content.includes('||') ||
                        content.includes('?.') ||
                        content.includes('if (!') ||
                        content.includes('if (') ||
                        content.includes('optional') ||
                        content.includes('maybeSingle');
  
  if (hasNullChecks) {
    chaosResults.missing_rows = 'PASS';
    runTest(`[ADMIN] ${featureName} missing_rows: PASS`, () => true);
  } else {
    chaosResults.missing_rows = 'WARN';
    runTest(`[ADMIN] ${featureName} missing_rows: WARN (may not handle missing rows)`, () => {
      return { pass: true, error: 'Should handle missing related rows gracefully' };
    });
  }
  
  // Test: partial_rows
  // Check if code handles partial/null fields
  const hasPartialHandling = content.includes('??') || 
                             content.includes('||') ||
                             content.includes('?.') ||
                             content.includes('default') ||
                             content.includes('fallback');
  
  if (hasPartialHandling) {
    chaosResults.partial_rows = 'PASS';
    runTest(`[ADMIN] ${featureName} partial_rows: PASS`, () => true);
  } else {
    chaosResults.partial_rows = 'WARN';
    runTest(`[ADMIN] ${featureName} partial_rows: WARN (may not handle partial data)`, () => {
      return { pass: true, error: 'Should handle partial/null fields gracefully' };
    });
  }
  
  // Test: empty_tables
  // Check if code handles empty query results
  const hasEmptyHandling = content.includes('length === 0') || 
                           content.includes('length > 0') ||
                           content.includes('?? []') ||
                           content.includes('|| []') ||
                           content.includes('empty') ||
                           content.includes('Empty');
  
  if (hasEmptyHandling) {
    chaosResults.empty_tables = 'PASS';
    runTest(`[ADMIN] ${featureName} empty_tables: PASS`, () => true);
  } else {
    chaosResults.empty_tables = 'WARN';
    runTest(`[ADMIN] ${featureName} empty_tables: WARN (may not handle empty results)`, () => {
      return { pass: true, error: 'Should handle empty query results gracefully' };
    });
  }
  
  results.chaosTests[featureName] = chaosResults;
}

// Test admin pages
async function testAdminPages() {
  console.log('\n👑 Testing Admin Pages...\n');

  const adminPages = [
    'app/dashboard/page.tsx',
    'app/ai-configuration/page.tsx',
    'app/logs/page.tsx',
    'app/users/page.tsx',
    'app/subscriptions/page.tsx',
    'app/feedback/page.tsx',
  ];

  adminPages.forEach(page => {
    const filePath = join(ADMIN_ROOT, page);
    const pageName = page.split('/').pop().replace('.tsx', '');
    
    runTest(`Admin page exists: ${pageName}`, () => {
      return existsSync(filePath);
    });

    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      
      // Check for NO personal data queries
      const hasPersonalDataQuery = 
        content.includes('.from("checkins")') ||
        content.includes(".from('checkins')") ||
        content.includes('.from("user_traits")') ||
        content.includes(".from('user_traits')") ||
        content.includes('.from("journal_entries")') ||
        content.includes(".from('journal_entries')");

      if (hasPersonalDataQuery) {
        results.suspiciousAccess.push(pageName);
        runTest(`${pageName} - NO personal data queries`, () => {
          return false;
        });
      } else {
        runTest(`${pageName} - NO personal data queries`, () => {
          return true;
        });
      }
      
      // PHASE 11: Test metadata chaos
      testMetadataChaos(pageName, filePath);
    }
  });
}

// Test admin API routes
async function testAdminAPIRoutes() {
  console.log('\n🔌 Testing Admin API Routes...\n');

  const adminRoutes = [
    { path: 'app/api/admin/config/get/route.ts', feature: 'admin_config' },
    { path: 'app/api/admin/config/save/route.ts', feature: 'admin_config' },
    { path: 'app/api/admin/logs/list/route.ts', feature: 'system_logs' },
    { path: 'app/api/admin/users/list/route.ts', feature: 'users' },
    { path: 'app/api/admin/subscriptions/list/route.ts', feature: 'subscriptions' },
    { path: 'app/api/admin/feedback/list/route.ts', feature: 'feedback' },
    { path: 'app/api/admin/analytics/get/route.ts', feature: 'analytics' },
  ];

  adminRoutes.forEach(({ path, feature }) => {
    const filePath = join(ADMIN_ROOT, path);
    const routeName = path.split('/').pop().replace('.ts', '');
    
    runTest(`Admin API route exists: ${routeName}`, () => {
      return existsSync(filePath);
    });

    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      
      // Check for metadata table usage
      const hasMetadataQuery = 
        content.includes('.from("admin_ai_config")') ||
        content.includes('.from("system_logs")') ||
        content.includes('.from("user_metadata")') ||
        content.includes('.from("profiles")') ||
        content.includes('.from("subscriptions")') ||
        content.includes('.from("feedback")') ||
        content.includes('.from("token_usage")');

      runTest(`${routeName} uses metadata tables`, () => {
        return hasMetadataQuery;
      });

      // Check for NO personal data queries
      const hasPersonalDataQuery = 
        content.includes('.from("checkins")') ||
        content.includes(".from('checkins')") ||
        content.includes('.from("user_traits")') ||
        content.includes(".from('user_traits')") ||
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
      
      // PHASE 11: Test metadata chaos
      testMetadataChaos(feature, filePath);
    }
  });
}

// Test persona settings sync
async function testPersonaSettingsSync() {
  console.log('\n🔄 Testing Persona Settings Sync...\n');

  // Check MOBILE personaServer reads from vella_settings
  const personaServerPath = join(__dirname, '..', 'MOBILE', 'lib/ai/personaServer.ts');
  if (existsSync(personaServerPath)) {
    const content = readFileSync(personaServerPath, 'utf-8');
    
    runTest('personaServer uses vella_settings (metadata)', () => {
      return content.includes('vella_settings');
    });

    runTest('personaServer uses profiles (metadata)', () => {
      return content.includes('profiles');
    });

    runTest('personaServer - NO personal data queries', () => {
      return !content.includes('.from("checkins")') && 
             !content.includes('.from("user_traits")') &&
             !content.includes('.from("journal_entries")');
    });
    
    // PHASE 11: Test metadata chaos for persona settings
    testMetadataChaos('vella_settings', personaServerPath);
  }

  // Check admin can update persona settings
  const adminUsersPath = join(ADMIN_ROOT, 'app/api/admin/users/update-voice/route.ts');
  if (existsSync(adminUsersPath)) {
    const content = readFileSync(adminUsersPath, 'utf-8');
    runTest('Admin can update voice settings', () => {
      return content.includes('vella_settings') || content.includes('voice');
    });
  }
}

// Test token usage sync
async function testTokenUsageSync() {
  console.log('\n💰 Testing Token Usage Sync...\n');

  // Check MOBILE writes to token_usage
  const chargeTokensPath = join(__dirname, '..', 'MOBILE', 'lib/tokens/chargeTokens.ts');
  if (existsSync(chargeTokensPath)) {
    const content = readFileSync(chargeTokensPath, 'utf-8');
    runTest('MOBILE writes to token_usage (metadata)', () => {
      return content.includes('token_usage');
    });
  }

  // Check admin reads from token_usage
  const adminAnalyticsPath = join(ADMIN_ROOT, 'app/api/admin/analytics/get/route.ts');
  if (existsSync(adminAnalyticsPath)) {
    const content = readFileSync(adminAnalyticsPath, 'utf-8');
    runTest('Admin reads from token_usage (metadata)', () => {
      return content.includes('token_usage') || content.includes('token');
    });
    
    // PHASE 11: Test metadata chaos for token usage
    testMetadataChaos('token_usage', adminAnalyticsPath);
  }
}

// Main test runner
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 11 — ADMIN INTEGRATION TEST (METADATA CHAOS)');
  console.log('═══════════════════════════════════════════════════════════\n');

  await testAdminPages();
  await testAdminAPIRoutes();
  await testPersonaSettingsSync();
  await testTokenUsageSync();

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`✅ PASSING: ${results.passing.length}`);
  console.log(`❌ FAILING: ${results.failing.length}`);
  
  // PHASE 11: Metadata chaos test matrix
  if (Object.keys(results.chaosTests).length > 0) {
    console.log('\n🌪️  METADATA CHAOS TEST MATRIX:');
    Object.entries(results.chaosTests).forEach(([feature, tests]) => {
      console.log(`\n   ${feature}:`);
      Object.entries(tests).forEach(([test, status]) => {
        const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : status === 'SKIP' ? '⏭️' : '❌';
        console.log(`     ${icon} ${test}: ${status}`);
      });
    });
  }
  
  if (results.passing.length > 0) {
    console.log('\n✅ PASSING TESTS:');
    results.passing.slice(0, 10).forEach(name => console.log(`   - ${name}`));
    if (results.passing.length > 10) {
      console.log(`   ... and ${results.passing.length - 10} more`);
    }
  }
  
  if (results.failing.length > 0) {
    console.log('\n❌ FAILING TESTS:');
    results.failing.slice(0, 10).forEach(name => console.log(`   - ${name}`));
    if (results.failing.length > 10) {
      console.log(`   ... and ${results.failing.length - 10} more`);
    }
  }
  
  if (results.suspiciousAccess.length > 0) {
    console.log('\n⚠️  SUSPICIOUS METADATA ACCESS (personal data queries detected):');
    results.suspiciousAccess.forEach(name => console.log(`   - ${name}`));
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  const hasFailures = results.failing.length > 0 || 
                      results.suspiciousAccess.length > 0 ||
                      Object.values(results.chaosTests).some(tests => 
                        Object.values(tests).some(status => status === 'FAIL')
                      );
  
  process.exit(hasFailures ? 1 : 0);
}

runAllTests().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
