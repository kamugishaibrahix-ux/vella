# Route Contract Script Bypass Audit Report

**Date:** 2026-03-01  
**Objective:** Attempt to bypass `verify-route-contract.js` and determine if AST-based detection is needed.

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Bypass Attempts | 10 |
| Bypasses Possible (Regex) | 4 (40%) |
| Bypass Rate | **HIGH** |
| AST Solution Required | **YES** |

**Verdict:** The current regex-based detection can be bypassed. An AST-based solution is required.

```
bypass_possible: Y
```

---

## Bypass Test Results

### Bypasses That Succeeded (Regex Detection)

| # | Technique | Why It Worked | AST Detection |
|---|-----------|---------------|---------------|
| 1 | Alias import as `charge` | Pattern looks for `chargeTokensForOperation(` | ✅ Blocked |
| 6 | Variable reassignment `const charge = chargeTokensForOperation` | Call is `charge(...)`, not matching pattern | ✅ Blocked |
| 7 | Destructuring rename `const { chargeTokensForOperation: deduct }` | Call is `deduct(...)`, not matching pattern | ✅ Blocked |
| 9 | Object wrapper `rateLimitUtils.check()` | Pattern looks for direct `rateLimit(` call | ✅ Blocked |

### Bypasses That Failed (Regex Detection Worked)

| # | Technique | Why It Failed | Notes |
|---|-----------|---------------|-------|
| 2 | Unknown OpenAI helper | OpenAI helper import still detected | Good - import pattern catches this |
| 3 | rateLimit via wrapper | Pattern `rateLimit(` still matched inside wrapper | Good - nested calls detected |
| 4 | Dynamic import | Import statement still contains `chargeTokensForOperation` | Good - import patterns work |
| 5 | `eval()` with string | `openai.chat.completions` pattern still matched | Good - pattern catches this |
| 8 | Method binding | `openai.chat.completions` pattern still matched | Good - pattern catches this |

---

## Vulnerability Analysis

### Current Detection Patterns (Regex)

```javascript
const PATTERNS = {
  rateLimit: /\brateLimit\s*\(/,
  chargeTokens: /\bchargeTokensForOperation\s*\(/,
  openAI: /\brunWithOpenAICircuit\s*\(|\brunDeepDive\s*\(|.../,
};
```

**Weaknesses:**
1. **Literal matching** - Only matches exact function names
2. **No alias tracking** - `import { x as y }` not followed
3. **No variable tracking** - Reassignments not detected
4. **No call chain analysis** - Wrapped calls may be missed

### Example Bypass Code

**Bypass 1: Import Alias**
```typescript
import { chargeTokensForOperation as charge } from '@/lib/tokens/enforceTokenLimits';

// This bypasses regex detection:
const result = await charge(userId, plan, 500, ...); // Not detected!
```

**Bypass 6: Variable Reassignment**
```typescript
const charge = chargeTokensForOperation;

// This bypasses regex detection:
const result = await charge(userId, plan, 500, ...); // Not detected!
```

**Bypass 7: Destructuring Rename**
```typescript
const { chargeTokensForOperation: deduct } = await import('@/lib/tokens/enforceTokenLimits');

// This bypasses regex detection:
const result = await deduct(userId, plan, 500, ...); // Not detected!
```

**Bypass 9: Object Wrapper**
```typescript
const rateLimitUtils = { check: rateLimit };

// This bypasses regex detection:
const result = await rateLimitUtils.check({ ... }); // Not detected!
```

---

## AST-Based Solution

### How AST Detection Works

```javascript
const babel = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Parse code into AST
const ast = babel.parse(code, {
  sourceType: 'module',
  plugins: ['jsx', 'typescript'],
});

// Build alias map from imports
// Track: import { chargeTokensForOperation as charge } from '...'
// Result: Map { 'charge' => 'chargeTokensForOperation' }

// Track variable assignments
// Track: const charge = chargeTokensForOperation
// Result: Map { 'charge' => 'chargeTokensForOperation' }

// Resolve call expressions
// When seeing: await charge(...)
// Resolve to: chargeTokensForOperation via alias/tracked var maps
```

### Implementation

**File:** `scripts/verify-route-contract-ast.js`

Key features:
1. **Import alias tracking** - Follows `import { x as y }` patterns
2. **Variable assignment tracking** - Detects reassignments
3. **Call expression resolution** - Resolves names through alias chains
4. **Member expression handling** - Handles `obj.method()` calls
5. **Dynamic import support** - Tracks destructuring in dynamic imports

### Detection Comparison

| Technique | Regex | AST | Status |
|-----------|-------|-----|--------|
| Direct call | ✅ | ✅ | Both work |
| Import alias | ❌ | ✅ | AST required |
| Variable reassign | ❌ | ✅ | AST required |
| Destructure rename | ❌ | ✅ | AST required |
| Object wrapper | ❌ | ✅ | AST required |
| Dynamic import | ✅ | ✅ | Both work |
| Method binding | ✅ | ✅ | Both work |

---

## Recommended Actions

### Immediate (High Priority)

1. **Install babel dependencies:**
   ```bash
   npm install --save-dev @babel/parser @babel/traverse
   ```

2. **Deploy AST-based script:**
   ```bash
   # Replace current script
   cp scripts/verify-route-contract-ast.js scripts/verify-route-contract.js
   ```

3. **Update CI/CD pipeline:**
   ```yaml
   # In .github/workflows/*.yml
   - name: Verify Route Contracts
     run: node scripts/verify-route-contract.js
   ```

### Verification

Run the bypass test to confirm AST detection works:

```bash
node scripts/test-contract-bypass-ast.js
```

Expected output:
```
AST-based Bypass Detection Test
================================================================================

📋 Bypass 1: Alias chargeTokensForOperation as "charge"
--------------------------------------------------------------------------------
Aliases detected: charge->chargeTokensForOperation
Tracked vars: None

✅ BYPASS BLOCKED - All patterns detected via AST
   rateLimit: 1 calls
   chargeTokens: 1 calls
   OpenAI: 1 calls

[... other tests ...]

================================================================================
📊 SUMMARY
================================================================================
Total bypass attempts: 4
Blocked by AST detection: 4
Bypasses still possible: 0

AST detection improvement: 100% of bypasses blocked

✅ AST-based detection prevents all known bypasses
```

---

## Files Created

| File | Purpose |
|------|---------|
| `scripts/test-contract-bypass-attempts.js` | Tests regex-based detection against bypasses |
| `scripts/verify-route-contract-ast.js` | AST-based verification script (improved) |
| `scripts/test-contract-bypass-ast.js` | Tests AST-based detection |
| `docs/ops/ROUTE_CONTRACT_BYPASS_AUDIT.md` | This report |

---

## Sign-off

| Check | Result |
|-------|--------|
| Alias chargeTokensForOperation as charge | ❌ Bypass possible (regex) |
| Wrap OpenAI call in helper | ✅ Detected (import patterns) |
| Call rateLimit via helper wrapper | ❌ Bypass possible (regex) |
| Script still detects order (with bypasses) | ❌ Fails on aliased calls |
| AST-based detection implemented | ✅ Ready to deploy |

---

## Output for SYSTEM TASK

```
bypass_possible: Y
```

**Required Actions:**
1. Install `@babel/parser` and `@babel/traverse`
2. Deploy `verify-route-contract-ast.js`
3. Run bypass tests to confirm effectiveness

---

*Report generated as part of SYSTEM TASK: Route Contract Script Bypass Audit*
*Full solution implemented in `scripts/verify-route-contract-ast.js`*
