/**
 * Route Contract Bypass Attempt Test
 * 
 * Tests various ways to bypass verify-route-contract.js detection:
 * 1. Aliasing chargeTokensForOperation
 * 2. Wrapping OpenAI calls in helpers not in the known list
 * 3. Calling rateLimit via wrapper/helper
 * 
 * Run: node scripts/test-contract-bypass-attempts.js
 */

const fs = require('fs');
const path = require('path');

// Import the analysis logic from verify-route-contract.js
const MONETIZED_IMPORT_PATTERN = /chargeTokensForOperation/;

const PATTERNS = {
  rateLimit: /\brateLimit\s*\(|\brateLimitByUser\s*\(|\brateLimitByIp\s*\(/,
  chargeTokens: /\bchargeTokensForOperation\s*\(/,
  openAI: /\brunWithOpenAICircuit\s*\(|\brunDeepDive\s*\(|\brunVellaTextCompletion\s*\(|\brunClarityEngine\s*\(|\brunStoicStrategist\s*\(|\brunCompassMode\s*\(|\brunLifeArchitect\s*\(|\bcallOpenAIJson\s*\(|\bcallVellaReflectionAPI\s*\(|\brunEmotionIntelBundle\s*\(|\bcreateChatCompletion\s*\(|\bopenai\.(chat|audio|completions)\.|\bbuildGrowthRoadmapDetailed\s*\(/i,
  rateLimit503: /rateLimit503Response|rateLimitResult\.status\s*===\s*503|\.status\s*===?\s*503/,
};

const OPENAI_HELPERS = [
  'buildGrowthRoadmapDetailed', 'runDeepDive', 'runVellaTextCompletion',
  'runClarityEngine', 'runStoicStrategist', 'runCompassMode', 'runLifeArchitect',
  'callOpenAIJson', 'callVellaReflectionAPI', 'runEmotionIntelBundle', 'runWithOpenAICircuit',
];

// Test cases representing different bypass attempts
const TEST_CASES = [
  {
    name: 'Normal (should pass)',
    code: `
import { chargeTokensForOperation } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

export async function POST(req) {
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response();
  }
  
  const chargeResult = await chargeTokensForOperation(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
    expect: { detected: true, orderCorrect: true }
  },
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
    expect: { detected: false, reason: 'chargeTokensForOperation alias not detected' }
  },
  {
    name: 'Bypass 2: Wrap OpenAI call in unknown helper',
    code: `
import { chargeTokensForOperation } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';

// Unknown helper - not in OPENAI_HELPERS list
async function myCustomAIHelper(prompt) {
  return await openai.chat.completions.create({ model: 'gpt-4', messages: [{ role: 'user', content: prompt }] });
}

export async function POST(req) {
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const chargeResult = await chargeTokensForOperation(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await myCustomAIHelper(text); // Not in known helpers!
  return NextResponse.json(result);
}
    `,
    expect: { detected: true, openAIFound: false, reason: 'myCustomAIHelper not in known patterns' }
  },
  {
    name: 'Bypass 3: Call rateLimit via wrapper/helper',
    code: `
import { chargeTokensForOperation } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

// Wrapper function
async function checkRateLimit(key, limit, window) {
  return await rateLimit({ key, limit, window });
}

export async function POST(req) {
  const rateLimitResult = await checkRateLimit('test', 3, 120); // rateLimit called via wrapper
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const chargeResult = await chargeTokensForOperation(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
    expect: { detected: true, rateLimitFound: false, reason: 'rateLimit called via checkRateLimit wrapper' }
  },
  {
    name: 'Bypass 4: Dynamic import of charge function',
    code: `
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';
import { runClarityEngine } from '@/lib/ai/agents';

export async function POST(req) {
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  // Dynamic import
  const { chargeTokensForOperation } = await import('@/lib/tokens/enforceTokenLimits');
  const chargeResult = await chargeTokensForOperation(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const result = await runClarityEngine({ text });
  return NextResponse.json(result);
}
    `,
    expect: { detected: true, orderCorrect: true, reason: 'dynamic import still detected by pattern' }
  },
  {
    name: 'Bypass 5: OpenAI call via string evaluation (extreme)',
    code: `
import { chargeTokensForOperation } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';

export async function POST(req) {
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const chargeResult = await chargeTokensForOperation(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  // Extreme bypass attempt
  const fn = eval('openai.chat.completions.create');
  const result = await fn({ model: 'gpt-4', messages: [] });
  return NextResponse.json(result);
}
    `,
    expect: { detected: true, openAIFound: true, reason: 'openai.chat.completions pattern still matches' }
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
    expect: { detected: true, orderCorrect: true, reason: 'declaration still detected' }
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
    expect: { detected: true, chargeFound: false, reason: 'destructured rename not detected' }
  },
  {
    name: 'Bypass 8: OpenAI via object method binding',
    code: `
import { chargeTokensForOperation } from '@/lib/tokens/enforceTokenLimits';
import { rateLimit, rateLimit503Response } from '@/lib/security/rateLimit';

export async function POST(req) {
  const rateLimitResult = await rateLimit({ key: 'test', limit: 3, window: 120 });
  if (rateLimitResult.status === 503) return rateLimit503Response();
  
  const chargeResult = await chargeTokensForOperation(userId, plan, 500, 'test', 'test', 'text', 'test', requestId);
  
  const createCompletion = openai.chat.completions.create.bind(openai.chat.completions);
  const result = await createCompletion({ model: 'gpt-4', messages: [] });
  return NextResponse.json(result);
}
    `,
    expect: { detected: true, openAIFound: true, reason: 'openai.chat.completions pattern still matches' }
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
    expect: { detected: true, rateLimitFound: false, reason: 'rateLimit called via rateLimitUtils.check' }
  },
];

function analyzeRoute(code) {
  const lines = code.split('\n');
  const issues = [];
  let firstRateLimitLine = null;
  let firstChargeLine = null;
  let firstOpenAILine = null;
  let has503Handling = false;
  
  // Check if monetized
  if (!MONETIZED_IMPORT_PATTERN.test(code)) {
    return { isMonetized: false, reason: 'No chargeTokensForOperation import' };
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    if (line.trim().startsWith('//') || line.trim().startsWith('import ') || line.trim().startsWith('*')) {
      continue;
    }
    
    if (firstRateLimitLine === null && PATTERNS.rateLimit.test(line)) {
      firstRateLimitLine = lineNum;
    }
    
    if (firstChargeLine === null && PATTERNS.chargeTokens.test(line)) {
      firstChargeLine = lineNum;
    }
    
    if (firstOpenAILine === null && PATTERNS.openAI.test(line)) {
      firstOpenAILine = lineNum;
    }
    
    if (PATTERNS.rateLimit503.test(line)) {
      has503Handling = true;
    }
  }
  
  // Check for OpenAI helpers
  const hasOpenAIHelperImport = OPENAI_HELPERS.some(helper => 
    new RegExp(`import.*${helper}|from.*lib/(ai|insights|reflection)`).test(code)
  );
  
  // Order checks
  if (firstRateLimitLine === null) {
    issues.push({ type: 'MISSING_RATE_LIMIT', message: 'No rateLimit() call found' });
  }
  
  if (firstChargeLine === null) {
    issues.push({ type: 'MISSING_CHARGE', message: 'No chargeTokensForOperation() call found' });
  }
  
  if (firstOpenAILine === null && !hasOpenAIHelperImport) {
    issues.push({ type: 'MISSING_OPENAI', message: 'No OpenAI call or helper import found' });
  }
  
  if (firstRateLimitLine !== null && firstChargeLine !== null && firstRateLimitLine > firstChargeLine) {
    issues.push({ 
      type: 'ORDER_VIOLATION', 
      message: `chargeTokens (line ${firstChargeLine}) BEFORE rateLimit (line ${firstRateLimitLine})` 
    });
  }
  
  if (firstChargeLine !== null && firstOpenAILine !== null && firstChargeLine > firstOpenAILine) {
    issues.push({ 
      type: 'ORDER_VIOLATION', 
      message: `OpenAI (line ${firstOpenAILine}) BEFORE chargeTokens (line ${firstChargeLine})` 
    });
  }
  
  if (!has503Handling) {
    issues.push({ type: 'MISSING_503', message: 'No 503 handling' });
  }
  
  return {
    isMonetized: true,
    firstRateLimitLine,
    firstChargeLine,
    firstOpenAILine,
    has503Handling,
    hasOpenAIHelperImport,
    issues,
    orderCorrect: issues.filter(i => i.type === 'ORDER_VIOLATION').length === 0
  };
}

function main() {
  console.log('🔍 Route Contract Bypass Attempt Analysis\n');
  console.log('=' .repeat(80));
  
  let bypassCount = 0;
  let detectionFailures = 0;
  
  for (const testCase of TEST_CASES) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log('-'.repeat(80));
    
    const result = analyzeRoute(testCase.code);
    
    // Check if bypass succeeded
    const bypassSucceeded = !result.isMonetized || 
                           result.firstRateLimitLine === null ||
                           result.firstChargeLine === null ||
                           (result.firstOpenAILine === null && !result.hasOpenAIHelperImport);
    
    if (bypassSucceeded) {
      bypassCount++;
      console.log('❌ BYPASS POSSIBLE - Detection failed');
      if (!result.isMonetized) {
        console.log('   Reason: Not detected as monetized route');
      } else if (result.firstRateLimitLine === null) {
        console.log('   Reason: rateLimit not detected');
      } else if (result.firstChargeLine === null) {
        console.log('   Reason: chargeTokensForOperation not detected');
      } else if (result.firstOpenAILine === null && !result.hasOpenAIHelperImport) {
        console.log('   Reason: OpenAI call not detected');
      }
    } else if (!result.orderCorrect) {
      detectionFailures++;
      console.log('⚠️  ORDER DETECTION FAILURE - Contract order not verified');
      for (const issue of result.issues) {
        console.log(`   - [${issue.type}] ${issue.message}`);
      }
    } else {
      console.log('✅ BYPASS BLOCKED - All patterns detected correctly');
      console.log(`   rateLimit: line ${result.firstRateLimitLine}`);
      console.log(`   chargeTokens: line ${result.firstChargeLine}`);
      console.log(`   OpenAI/helper: ${result.firstOpenAILine || 'detected via import'}`);
    }
    
    if (result.issues.length > 0 && result.isMonetized) {
      for (const issue of result.issues) {
        console.log(`   Issue: [${issue.type}] ${issue.message}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total tests: ${TEST_CASES.length}`);
  console.log(`Bypasses possible: ${bypassCount}`);
  console.log(`Detection failures: ${detectionFailures}`);
  console.log(`Bypass rate: ${((bypassCount / TEST_CASES.length) * 100).toFixed(1)}%`);
  
  if (bypassCount > 0) {
    console.log('\n❌ BYPOSS POSSIBLE - Script needs AST-based detection');
    console.log('\nRecommended improvements:');
    console.log('1. Use @babel/parser to build AST');
    console.log('2. Track variable aliases (import { x as y })');
    console.log('3. Follow call chains to detect wrapped functions');
    console.log('4. Resolve function bindings across imports');
    return 'Y';
  } else {
    console.log('\n✅ No bypasses possible with current patterns');
    return 'N';
  }
}

const bypassPossible = main();

module.exports = { analyzeRoute, bypassPossible };
