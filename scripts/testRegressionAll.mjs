#!/usr/bin/env node

/**
 * PHASE 11 — Regression Test Orchestrator
 * 
 * Runs all test suites and produces a unified summary.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testSuites = [
  { name: 'MOBILE HARNESS', script: join(__dirname, 'testHarness.mjs') },
  { name: 'API WIRING', script: join(__dirname, 'testAPIWiring.mjs') },
  { name: 'ADMIN INTEGRATION', script: join(__dirname, 'testAdminIntegration.mjs') },
];

const results = {};

function runTestSuite(name, scriptPath) {
  return new Promise((resolve) => {
    console.log(`\n[PHASE11] Running ${name}...\n`);
    
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      shell: true,
    });
    
    child.on('close', (code) => {
      const status = code === 0 ? 'PASS' : 'FAIL';
      results[name] = status;
      resolve(status);
    });
    
    child.on('error', (error) => {
      console.error(`[PHASE11] Error running ${name}:`, error.message);
      results[name] = 'FAIL';
      resolve('FAIL');
    });
  });
}

async function runAllSuites() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 11 — REGRESSION + CHAOS HARDENING');
  console.log('═══════════════════════════════════════════════════════════');
  
  for (const suite of testSuites) {
    await runTestSuite(suite.name, suite.script);
  }
  
  // Print final summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  PHASE 11 — FINAL SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  Object.entries(results).forEach(([name, status]) => {
    const icon = status === 'PASS' ? '✅' : '❌';
    console.log(`[PHASE11] ${name}: ${icon} ${status}`);
  });
  
  const overallStatus = Object.values(results).every(status => status === 'PASS') ? 'PASS' : 'FAIL';
  const overallIcon = overallStatus === 'PASS' ? '✅' : '❌';
  console.log(`\n[PHASE11] OVERALL: ${overallIcon} ${overallStatus}`);
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  
  process.exit(overallStatus === 'PASS' ? 0 : 1);
}

runAllSuites().catch((error) => {
  console.error('[PHASE11] Fatal error:', error);
  process.exit(1);
});

