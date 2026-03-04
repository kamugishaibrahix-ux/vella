#!/usr/bin/env node
/**
 * AST-based Route Contract Verification Script
 * 
 * This improved version uses @babel/parser to build an AST and properly detect:
 * - Aliased imports (import { x as y })
 * - Variable reassignments (const charge = chargeTokensForOperation)
 * - Wrapped function calls
 * - Dynamic imports
 * 
 * This prevents the bypasses that worked against the regex-based version.
 * 
 * Run: node scripts/verify-route-contract-ast.js
 */

const fs = require('fs');
const path = require('path');

// Try to import babel parser
try {
  var babel = require('@babel/parser');
  var traverse = require('@babel/traverse').default;
} catch (e) {
  console.error('❌ @babel/parser and @babel/traverse are required.');
  console.error('   Install with: npm install --save-dev @babel/parser @babel/traverse');
  process.exit(1);
}

const ROUTES_DIR = path.join(__dirname, '..', 'app', 'api');

// Known OpenAI-related function patterns (imported from lib)
const OPENAI_PATTERNS = [
  'runWithOpenAICircuit', 'runDeepDive', 'runVellaTextCompletion', 'runClarityEngine',
  'runStoicStrategist', 'runCompassMode', 'runLifeArchitect', 'callOpenAIJson',
  'callVellaReflectionAPI', 'runEmotionIntelBundle', 'createChatCompletion',
  'buildGrowthRoadmapDetailed', 'openai.chat.completions.create',
  'openai.audio.transcriptions.create', 'openai.audio.speech.create',
];

const IGNORED_ROUTES = [
  'internal/metrics/route.ts', 'internal/migration/route.ts', 'internal/governance/route.ts',
  'admin/route.ts', 'stripe/webhook/route.ts', 'system/health/route.ts',
];

function shouldIgnoreRoute(routePath) {
  const relativePath = routePath.replace(ROUTES_DIR + path.sep, '').replace(/\\/g, '/');
  return IGNORED_ROUTES.some(ignored => relativePath.includes(ignored.replace('/route.ts', '')));
}

/**
 * Build alias map from import statements
 * Tracks: import { chargeTokensForOperation as charge } from '...'
 *         import * as tokens from '...' (then tokens.chargeTokensForOperation)
 */
function buildAliasMap(ast) {
  const aliases = new Map();
  const namespaceImports = new Map();
  
  traverse(ast, {
    ImportDeclaration(nodePath) {
      const source = nodePath.node.source.value;
      
      // Check if it's from our token/security libs
      const isTokenLib = source.includes('/tokens/') || source.includes('enforceTokenLimits');
      const isRateLimitLib = source.includes('/security/rateLimit');
      const isAILib = source.includes('/ai/') || source.includes('/insights/');
      
      for (const specifier of nodePath.node.specifiers) {
        if (specifier.type === 'ImportSpecifier') {
          const imported = specifier.imported.name;
          const local = specifier.local.name;
          
          // Track aliasing
          if (imported !== local) {
            aliases.set(local, imported);
          }
          
          // Track original names
          if (isTokenLib && imported === 'chargeTokensForOperation') {
            aliases.set(local, 'chargeTokensForOperation');
          }
          if (isRateLimitLib && imported === 'rateLimit') {
            aliases.set(local, 'rateLimit');
          }
        }
        
        // Namespace imports: import * as tokens from '...'
        if (specifier.type === 'ImportNamespaceSpecifier') {
          namespaceImports.set(specifier.local.name, { source, isTokenLib, isRateLimitLib, isAILib });
        }
      }
    }
  });
  
  return { aliases, namespaceImports };
}

/**
 * Track variable reassignments
 * const charge = chargeTokensForOperation;
 * const { chargeTokensForOperation: deduct } = await import('...');
 */
function trackVariableAssignments(ast, aliases) {
  const trackedVars = new Map();
  
  traverse(ast, {
    VariableDeclarator(nodePath) {
      const init = nodePath.node.init;
      const id = nodePath.node.id;
      
      // Direct assignment: const charge = chargeTokensForOperation
      if (init && init.type === 'Identifier') {
        const originalName = aliases.get(init.name) || init.name;
        if (aliases.has(init.name) || originalName === 'chargeTokensForOperation' || originalName === 'rateLimit') {
          trackedVars.set(id.name, originalName);
        }
      }
      
      // Destructuring: const { chargeTokensForOperation: deduct } = await import('...')
      // OR: const { chargeTokensForOperation: deduct } = await (await import('...'))
      if (id && id.type === 'ObjectPattern' && init) {
        // Check if it's an import() call (possibly wrapped in await)
        let importCall = null;
        if (init.type === 'CallExpression' && init.callee.type === 'Import') {
          importCall = init;
        } else if (init.type === 'AwaitExpression' && init.argument.type === 'CallExpression' && init.argument.callee.type === 'Import') {
          importCall = init.argument;
        }
        
        if (importCall) {
          for (const prop of id.properties) {
            if (prop.type === 'ObjectProperty' && prop.value && prop.value.name) {
              const importedName = prop.key.name;
              const localName = prop.value.name;
              if (importedName === 'chargeTokensForOperation' || importedName === 'rateLimit') {
                trackedVars.set(localName, importedName);
              }
            }
          }
        }
      }
    }
  });
  
  return trackedVars;
}

/**
 * Find all call expressions and resolve their original names
 */
function findCallExpressions(ast, aliases, trackedVars) {
  const calls = {
    rateLimit: [],
    chargeTokens: [],
    openAI: [],
    rateLimit503: []
  };
  
  traverse(ast, {
    CallExpression(nodePath) {
      const node = nodePath.node;
      const loc = node.loc;
      
      // Get the callee name
      let calleeName = null;
      let fullChain = '';
      
      if (node.callee.type === 'Identifier') {
        calleeName = node.callee.name;
      } else if (node.callee.type === 'MemberExpression') {
        // Handle: obj.method() or obj.nested.method()
        const parts = [];
        let current = node.callee;
        
        while (current) {
          if (current.type === 'MemberExpression') {
            if (current.property.type === 'Identifier') {
              parts.unshift(current.property.name);
            }
            current = current.object;
          } else if (current.type === 'Identifier') {
            parts.unshift(current.name);
            break;
          } else {
            break;
          }
        }
        
        fullChain = parts.join('.');
        calleeName = parts[parts.length - 1];
      }
      
      // Resolve alias/tracked var to original name
      const resolvedName = aliases.get(calleeName) || trackedVars.get(calleeName) || calleeName;
      
      // Check patterns
      if (resolvedName === 'rateLimit' || fullChain.includes('rateLimit')) {
        calls.rateLimit.push({ line: loc.start.line, name: calleeName, resolved: resolvedName });
      }
      
      if (resolvedName === 'chargeTokensForOperation') {
        calls.chargeTokens.push({ line: loc.start.line, name: calleeName, resolved: resolvedName });
      }
      
      // Check OpenAI patterns
      const isOpenAI = OPENAI_PATTERNS.some(pattern => {
        const parts = pattern.split('.');
        if (parts.length === 1) {
          return resolvedName === pattern || calleeName === pattern;
        } else {
          return fullChain.includes(pattern) || fullChain === pattern;
        }
      });
      
      if (isOpenAI) {
        calls.openAI.push({ line: loc.start.line, name: calleeName, chain: fullChain });
      }
    },
    
    // Detect 503 handling patterns
    MemberExpression(nodePath) {
      const node = nodePath.node;
      // Check if hub exists (won't exist when testing with programmatically generated ASTs)
      if (nodePath.hub && nodePath.hub.file && nodePath.hub.file.opts && nodePath.hub.file.opts.filename) {
        const code = fs.readFileSync(nodePath.hub.file.opts.filename, 'utf-8');
        const lines = code.split('\n');
        const line = lines[node.loc.start.line - 1];
        
        if (line && (line.includes('rateLimit503Response') || line.includes('status') && line.includes('503'))) {
          calls.rateLimit503.push({ line: node.loc.start.line });
        }
      }
    }
  });
  
  return calls;
}

/**
 * Check if code contains OpenAI helper imports
 */
function hasOpenAIHelperImport(ast) {
  let hasHelper = false;
  
  traverse(ast, {
    ImportDeclaration(nodePath) {
      const source = nodePath.node.source.value;
      if (source.includes('/ai/') || source.includes('/insights/') || source.includes('reflection')) {
        hasHelper = true;
      }
    }
  });
  
  return hasHelper;
}

/**
 * Check for dynamic imports of OpenAI helpers
 */
function hasDynamicOpenAIImport(ast) {
  let hasDynamic = false;
  
  traverse(ast, {
    CallExpression(nodePath) {
      if (nodePath.node.callee.type === 'Import') {
        const arg = nodePath.node.arguments[0];
        if (arg && arg.value && (arg.value.includes('/ai/') || arg.value.includes('/insights/'))) {
          hasDynamic = true;
        }
      }
    }
  });
  
  return hasDynamic;
}

function analyzeRoute(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Quick check: does it import chargeTokensForOperation?
  if (!content.includes('chargeTokensForOperation')) {
    return null; // Not a monetized route
  }
  
  let ast;
  try {
    ast = babel.parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      attachComments: false
    });
  } catch (error) {
    return {
      file: filePath,
      isMonetized: true,
      issues: [{ type: 'PARSE_ERROR', message: `Failed to parse: ${error.message}` }]
    };
  }
  
  // Build alias map
  const { aliases, namespaceImports } = buildAliasMap(ast);
  
  // Track variable assignments
  const trackedVars = trackVariableAssignments(ast, aliases);
  
  // Find all call expressions
  const calls = findCallExpressions(ast, aliases, trackedVars);
  
  // Check for OpenAI helpers
  const hasOpenAIHelper = hasOpenAIHelperImport(ast) || hasDynamicOpenAIImport(ast);
  
  const issues = [];
  
  // Get first occurrences
  const firstRateLimit = calls.rateLimit.length > 0 ? Math.min(...calls.rateLimit.map(c => c.line)) : null;
  const firstCharge = calls.chargeTokens.length > 0 ? Math.min(...calls.chargeTokens.map(c => c.line)) : null;
  const firstOpenAI = calls.openAI.length > 0 ? Math.min(...calls.openAI.map(c => c.line)) : null;
  
  // Validate order
  if (firstRateLimit === null) {
    issues.push({ type: 'MISSING_RATE_LIMIT', message: 'No rateLimit() call found' });
  }
  
  if (firstCharge === null) {
    issues.push({ type: 'MISSING_CHARGE', message: 'No chargeTokensForOperation() call found' });
  }
  
  if (firstOpenAI === null && !hasOpenAIHelper) {
    issues.push({ type: 'MISSING_OPENAI', message: 'No OpenAI call or helper import found' });
  }
  
  // Check order violations
  if (firstRateLimit !== null && firstCharge !== null && firstRateLimit > firstCharge) {
    issues.push({
      type: 'ORDER_VIOLATION',
      message: `chargeTokens (line ${firstCharge}) called BEFORE rateLimit (line ${firstRateLimit})`
    });
  }
  
  if (firstCharge !== null && firstOpenAI !== null && firstCharge > firstOpenAI) {
    issues.push({
      type: 'ORDER_VIOLATION',
      message: `OpenAI call (line ${firstOpenAI}) called BEFORE chargeTokens (line ${firstCharge})`
    });
  }
  
  // Check 503 handling
  if (calls.rateLimit503.length === 0) {
    // Also check with regex as fallback for 503 detection
    if (!/rateLimit503Response|\.status\s*===?\s*503/.test(content)) {
      issues.push({ type: 'MISSING_503_HANDLING', message: 'No rateLimit 503 handling found' });
    }
  }
  
  return {
    file: filePath,
    isMonetized: true,
    firstRateLimitLine: firstRateLimit,
    firstChargeLine: firstCharge,
    firstOpenAILine: firstOpenAI,
    has503Handling: calls.rateLimit503.length > 0,
    aliases: Array.from(aliases.entries()),
    trackedVars: Array.from(trackedVars.entries()),
    issues
  };
}

function findRouteFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath));
    } else if (entry.name === 'route.ts') {
      files.push(fullPath);
    }
  }
  
  return files;
}

function main() {
  console.log('🔍 AST-based Route Contract Verification\n');
  
  if (!fs.existsSync(ROUTES_DIR)) {
    console.error(`❌ Routes directory not found: ${ROUTES_DIR}`);
    process.exit(1);
  }
  
  const routeFiles = findRouteFiles(ROUTES_DIR);
  console.log(`Found ${routeFiles.length} route files\n`);
  
  let monetizedCount = 0;
  let violationCount = 0;
  const results = [];
  
  for (const filePath of routeFiles) {
    if (shouldIgnoreRoute(filePath)) {
      continue;
    }
    
    const result = analyzeRoute(filePath);
    if (result && result.isMonetized) {
      monetizedCount++;
      results.push(result);
      const relativePath = path.relative(process.cwd(), filePath);
      
      if (result.issues.length > 0) {
        violationCount++;
        console.log(`\n❌ ${relativePath}`);
        for (const issue of result.issues) {
          console.log(`   - [${issue.type}] ${issue.message}`);
        }
        if (result.aliases.length > 0) {
          console.log(`   Aliases detected: ${result.aliases.map(([k, v]) => `${k}->${v}`).join(', ')}`);
        }
      } else {
        console.log(`✅ ${relativePath}`);
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total routes: ${routeFiles.length}`);
  console.log(`   Monetized routes: ${monetizedCount}`);
  console.log(`   Violations: ${violationCount}`);
  
  if (violationCount > 0) {
    console.log(`\n❌ CONTRACT VIOLATIONS FOUND - Build would fail`);
    process.exit(1);
  } else {
    console.log(`\n✅ All monetized routes follow correct contract (AST-verified)`);
    console.log(`   Bypass attempts blocked: aliases, wrappers, dynamic imports detected`);
    process.exit(0);
  }
}

// If run directly
if (require.main === module) {
  main();
}

module.exports = { analyzeRoute, buildAliasMap, findCallExpressions };
