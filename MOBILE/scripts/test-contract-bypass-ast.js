/**
 * Test AST-based detection against bypass attempts
 */

const fs = require('fs');
const path = require('path');

// Try to import babel
try {
  var babel = require('@babel/parser');
  var traverse = require('@babel/traverse').default;
} catch (e) {
  console.log('⚠️  @babel/parser not installed. Installing...');
  console.log('   Run: npm install --save-dev @babel/parser @babel/traverse');
  process.exit(1);
}

// Import our AST analyzer
const { buildAliasMap, findCallExpressions, trackVariableAssignments } = require('./verify-route-contract-ast.js');

const TEST_CASES = [
  {
    name: 'Bypass 1: Alias chargeTokensForOperation as "charge"',
    code: `
import { chargeTokensForOperation as charge } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

export async function POST(req) {
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const chargeResult = await charge(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
  },
  {
    name: 'Bypass 6: Variable reassignment of charge function',
    code: `
import { chargeTokensForOperation } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

export async function POST(req) {
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const charge = chargeTokensForOperation;
  const chargeResult = await charge(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
  },
  {
    name: 'Bypass 7: Destructuring with rename in function',
    code: `
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

export async function POST(req) {
  const { chargeTokensForOperation: deduct } = await import('@/lib/tokens/enforceTokenLimits');
  
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const chargeResult = await deduct(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
  },
  {
    name: 'Bypass 9: Indirect rateLimit via object spread',
    code: `
import { chargeTokensForOperation } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit as rl, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

const rateLimitUtils = { check: rl, handle503: rateLimit503Response };

export async function POST(req) {
  const rateLimitResult = await rateLimitUtils.check({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimitUtils.handle503();
  
  const chargeResult = await chargeTokensForOperation(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
  },
];

function analyzeWithAST(testCase) {
  try {
    const ast = babel.parse(testCase.code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
    
    const { aliases } = buildAliasMap(ast);
    const trackedVars = trackVariableAssignments(ast, aliases);
    const calls = findCallExpressions(ast, aliases, trackedVars);
    
    return {
      aliases: Array.from(aliases.entries()),
      trackedVars: Array.from(trackedVars.entries()),
      calls,
      detected: {
        rateLimit: calls.rateLimit.length > 0,
        charge: calls.chargeTokens.length > 0,
        openAI: calls.openAI.length > 0
      }
    };
  } catch (error) {
    return { error: error.message };
  }
}

function main() {
  console.log('🔍 AST-based Bypass Detection Test\n');
  console.log('=' .repeat(80));
  
  let blockedCount = 0;
  
  for (const testCase of TEST_CASES) {
    console.log(`\n📋 ${testCase.name}`);
    console.log('-'.repeat(80));
    
    const result = analyzeWithAST(testCase);
    
    if (result.error) {
      console.log(`❌ Parse error: ${result.error}`);
      continue;
    }
    
    console.log('Aliases detected:', result.aliases.length > 0 ? result.aliases.map(([k, v]) => `${k}->${v}`).join(', ') : 'None');
    console.log('Tracked vars:', result.trackedVars.length > 0 ? result.trackedVars.map(([k, v]) => `${k}->${v}`).join(', ') : 'None');
    console.log('');
    
    const allDetected = result.detected.rateLimit && result.detected.charge && result.detected.openAI;
    
    if (allDetected) {
      console.log('✅ BYPASS BLOCKED - All patterns detected via AST');
      console.log(`   rateLimit: ${result.calls.rateLimit.length} calls`);
      console.log(`   chargeTokens: ${result.calls.chargeTokens.length} calls`);
      console.log(`   OpenAI: ${result.calls.openAI.length} calls`);
      blockedCount++;
    } else {
      console.log('❌ BYPASS STILL POSSIBLE - Detection gaps:');
      if (!result.detected.rateLimit) console.log('   - rateLimit not detected');
      if (!result.detected.charge) console.log('   - chargeTokens not detected');
      if (!result.detected.openAI) console.log('   - OpenAI not detected');
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total bypass attempts: ${TEST_CASES.length}`);
  console.log(`Blocked by AST detection: ${blockedCount}`);
  console.log(`Bypasses still possible: ${TEST_CASES.length - blockedCount}`);
  
  const improvement = ((blockedCount / TEST_CASES.length) * 100).toFixed(0);
  console.log(`\nAST detection improvement: ${improvement}% of bypasses blocked`);
  
  if (blockedCount === TEST_CASES.length) {
    console.log('\n✅ AST-based detection prevents all known bypasses');
  } else {
    console.log('\n⚠️  Some bypasses may still be possible - review detection gaps');
  }
}

main();
