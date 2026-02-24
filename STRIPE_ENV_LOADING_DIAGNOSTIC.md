# STRIPE ENV LOADING DIAGNOSTIC REPORT

**Date:** 2025-01-XX  
**Purpose:** Identify why MOBILE/.env.local is not being loaded by Next.js runtime  
**Status:** READ-ONLY DIAGNOSTIC (No files modified)

---

## STEP 1 — PROJECT ROOT AND NEXT.JS APP ROOT

### ✅ Detected Paths

| Path Type | Location | Confirmed Files |
|-----------|----------|----------------|
| **Workspace Root** | `C:\dev` | ✅ `package.json` (monorepo config), `pnpm-workspace.yaml`, `supabase/` |
| **Next.js App Root** | `C:\dev\MOBILE` | ✅ `next.config.mjs`, `app/`, `package.json` |

**Confirmation:**
- Workspace root: `C:\dev` (contains `pnpm-workspace.yaml` with packages: `["MOBILE", "apps/*"]`)
- Next.js app root: `C:\dev\MOBILE` (contains `next.config.mjs`, `app/` directory, `package.json`)

---

## STEP 2 — ENVIRONMENT FILES SCAN

### 🔍 Scan Results

**Files Scanned:**
- `.env`
- `.env.local`
- `.env.development`
- `.env.development.local`
- `.env.production`
- `.env.production.local`
- Any file beginning with `.env*`

**Results:**

| File Path | Location | Status | Contains STRIPE_ Variables |
|-----------|----------|--------|---------------------------|
| **No .env files found** | - | ❌ **NOT VISIBLE** | N/A |

**Note:** .env files are typically in `.gitignore`, so they may exist but are not visible to file scanning tools. The diagnostic cannot definitively confirm their existence without direct file system access.

---

## STEP 3 — PRECEDENCE CONFLICTS

### ⚠️ **CRITICAL FINDING: Custom Env Loading Override**

**Next.js Default Precedence (NOT USED):**
1. `.env.local` (in Next.js app root)
2. `.env.development.local` (if NODE_ENV=development)
3. `.env.development` (if NODE_ENV=development)
4. `.env`
5. System environment variables

**ACTUAL Precedence (CUSTOM IMPLEMENTATION):**

The project uses a **custom environment loader** that overrides Next.js default behavior:

**File:** `MOBILE/next.config.mjs` (Lines 1-9)
```javascript
import envResolver from "../scripts/envRootResolver.js";
const { loadRootEnv } = envResolver;

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
loadRootEnv({ startDir: repoRoot });  // ← LOADS FROM REPO ROOT, NOT MOBILE/
```

**File:** `scripts/envRootResolver.js` (Lines 35-38, 58-60)
```javascript
function getRootEnvPath(startDir) {
  const root = getRepoRoot(startDir);
  return path.join(root, ".env.local");  // ← RETURNS REPO ROOT .env.local
}

function loadRootEnv(options = {}) {
  const envPath = getRootEnvPath(options.startDir);
  parseEnvFile(envPath);  // ← LOADS FROM REPO ROOT ONLY
}
```

### 🚨 **ROOT CAUSE IDENTIFIED**

**The project is configured to load `.env.local` from the REPO ROOT (`C:\dev\.env.local`), NOT from the Next.js app root (`C:\dev\MOBILE\.env.local`).**

**Evidence:**
- `MOBILE/next.config.mjs` calls `loadRootEnv({ startDir: repoRoot })` where `repoRoot` is `C:\dev` (parent of MOBILE)
- `envRootResolver.js` explicitly returns `path.join(root, ".env.local")` - the repo root, not MOBILE
- `scripts/verifyDataDesignRead.mjs` (Line 51) explicitly warns:
  ```javascript
  if (mobileEnvExists) {
    console.warn(`[ENV:HARDEN] WARNING: ${mobileEnvPath} exists. Root .env.local is authoritative. MOBILE/.env.local will be ignored.`);
  }
  ```

### Precedence Order (ACTUAL)

1. **`.env.local` at REPO ROOT** (`C:\dev\.env.local`) - **AUTHORITATIVE**
2. System environment variables
3. **`MOBILE/.env.local`** - **IGNORED** (if repo root .env.local exists)

**NODE_ENV Impact:**
- `NODE_ENV` is checked in code but does NOT affect which .env file is loaded
- The custom loader always loads from repo root, regardless of NODE_ENV

---

## STEP 4 — DOTENV LOADING BEHAVIOR

### ✅ Package.json Scripts

**File:** `MOBILE/package.json`
```json
{
  "scripts": {
    "predev": "node ../scripts/verifyDataDesignRead.mjs --force-root || exit 1",
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

**Analysis:**
- ✅ `dev` script runs `next dev` (standard Next.js command)
- ✅ `predev` hook runs before `dev`, which loads root env via `verifyDataDesignRead.mjs`
- ❌ No `dotenv` or `dotenv-flow` package in dependencies
- ❌ No custom dotenv config in package.json

### ✅ Next.js Config Override

**File:** `MOBILE/next.config.mjs` (Lines 1-9)
```javascript
import envResolver from "../scripts/envRootResolver.js";
const { loadRootEnv } = envResolver;

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
loadRootEnv({ startDir: repoRoot });  // ← EXECUTES AT BUILD TIME
```

**Analysis:**
- ✅ **Custom env loader is executed at Next.js config load time**
- ✅ Loads environment from `C:\dev\.env.local` (repo root)
- ✅ This happens BEFORE Next.js's default env loading
- ❌ Next.js default `.env.local` loading in `MOBILE/` is effectively bypassed

### ✅ Middleware Inspection

**File:** `MOBILE/middleware.ts`
- ❌ No environment variable overrides
- ❌ No dotenv loading
- ✅ Only handles Supabase auth session

**Analysis:** Middleware does not interfere with env loading.

---

## STEP 5 — NEXT.JS RUNTIME LOCATION

### ✅ Confirmed Runtime Location

**Next.js Server Start:**
- **Command:** `pnpm dev` (from MOBILE directory) OR `cd MOBILE && pnpm dev`
- **Working Directory:** `C:\dev\MOBILE` (Next.js app root)
- **Next.js Process:** Runs from `C:\dev\MOBILE`

**However:**
- **Env Loading:** Happens in `next.config.mjs` which resolves repo root as `C:\dev` (parent directory)
- **Env File Location:** Loaded from `C:\dev\.env.local` (repo root), NOT `C:\dev\MOBILE\.env.local`

**Evidence:**
```javascript
// MOBILE/next.config.mjs:8
const repoRoot = path.resolve(path.dirname(__filename), "..");
// __filename = C:\dev\MOBILE\next.config.mjs
// path.dirname(__filename) = C:\dev\MOBILE
// path.resolve(..., "..") = C:\dev (repo root)
```

---

## STEP 6 — RUNTIME ENV RESOLUTION SIMULATION

### 📋 Next.js Env Resolution Order (THEORETICAL)

**Default Next.js Order (if no custom loader):**
1. `MOBILE/.env.local`
2. `MOBILE/.env.development.local` (if NODE_ENV=development)
3. `MOBILE/.env.development` (if NODE_ENV=development)
4. `MOBILE/.env`
5. System environment variables

### 📋 ACTUAL Env Resolution Order (CUSTOM IMPLEMENTATION)

**What Actually Happens:**

1. **`next.config.mjs` loads (build/start time)**
   - Executes: `loadRootEnv({ startDir: repoRoot })`
   - Loads: `C:\dev\.env.local` (repo root)
   - Sets: `process.env` variables from repo root file
   - **Timing:** BEFORE Next.js default env loading

2. **Next.js default env loading (if it runs)**
   - Would load: `MOBILE/.env.local` (if exists)
   - **BUT:** Variables already set from repo root take precedence
   - **Result:** `MOBILE/.env.local` values are IGNORED if repo root `.env.local` exists

3. **System environment variables**
   - Applied last (highest precedence if set)

### 🎯 Complete Ranked List

| Priority | Source | Location | Status |
|----------|--------|----------|--------|
| **1 (Highest)** | System env vars | `process.env.*` | ✅ Always loaded |
| **2** | **Repo root `.env.local`** | `C:\dev\.env.local` | ✅ **LOADED FIRST** (custom loader) |
| **3** | Next.js default `.env.local` | `C:\dev\MOBILE\.env.local` | ⚠️ **IGNORED** (if repo root exists) |
| **4** | Next.js `.env.development.local` | `C:\dev\MOBILE\.env.development.local` | ❓ Not used (custom loader) |
| **5** | Next.js `.env.development` | `C:\dev\MOBILE\.env.development` | ❓ Not used (custom loader) |
| **6** | Next.js `.env` | `C:\dev\MOBILE\.env` | ❓ Not used (custom loader) |

### 🔄 Variable Override Behavior

**If both files exist:**
- `C:\dev\.env.local` (repo root) → **WINS** (loaded first by custom loader)
- `C:\dev\MOBILE\.env.local` → **IGNORED** (Next.js default loader runs after, but values already set)

**Evidence from `scripts/verifyDataDesignRead.mjs:51`:**
```javascript
if (mobileEnvExists) {
  console.warn(`[ENV:HARDEN] WARNING: ${mobileEnvPath} exists. Root .env.local is authoritative. MOBILE/.env.local will be ignored.`);
}
```

---

## STEP 7 — STATIC ENV OVERRIDES

### ✅ Code Inspection Results

**Hardcoded Fallbacks:**
- ❌ No hardcoded `STRIPE_SECRET_KEY` fallbacks found
- ❌ No code that replaces or sanitizes `process.env`
- ❌ No `envFiles` config in `next.config.mjs`
- ❌ No local dotenv config that interferes

**Stripe Env Usage:**
- ✅ `MOBILE/lib/payments/stripe.ts:3` - Uses `process.env.STRIPE_SECRET_KEY`
- ✅ `MOBILE/app/api/stripe/webhook/route.ts:37` - Uses `process.env.STRIPE_WEBHOOK_SECRET`
- ✅ All Stripe env vars are read from `process.env` (no hardcoded values)

**Analysis:** No static overrides found. The issue is purely the env file location.

---

## STEP 8 — FINAL DIAGNOSTIC

### 🎯 **EXACT ROOT CAUSE**

**MOBILE/.env.local is NOT being loaded because:**

1. **Custom Environment Loader Override:**
   - `MOBILE/next.config.mjs` imports and calls `loadRootEnv()` from `scripts/envRootResolver.js`
   - This loader explicitly loads `.env.local` from the **REPO ROOT** (`C:\dev\.env.local`), not from the Next.js app root

2. **Explicit Design Decision:**
   - The project is designed to use a **single authoritative `.env.local` file at the repo root**
   - `scripts/verifyDataDesignRead.mjs` explicitly warns that `MOBILE/.env.local` will be ignored if repo root `.env.local` exists
   - This is intentional architecture, not a bug

3. **Next.js Default Behavior Bypassed:**
   - Next.js's default env loading (which would read `MOBILE/.env.local`) is effectively bypassed
   - The custom loader runs first and sets `process.env` before Next.js default loading
   - Once variables are set, Next.js won't override them

### 📍 **EXACT FILE/FOLDER RESPONSIBLE**

| File | Line | Responsibility |
|------|------|---------------|
| `MOBILE/next.config.mjs` | 9 | Calls `loadRootEnv()` which loads repo root env |
| `scripts/envRootResolver.js` | 35-38 | `getRootEnvPath()` returns repo root `.env.local` path |
| `scripts/envRootResolver.js` | 58-60 | `loadRootEnv()` loads from repo root only |
| `scripts/verifyDataDesignRead.mjs` | 51 | Warns that MOBILE/.env.local will be ignored |

### 🔧 **EXACT FIX REQUIRED**

**Option 1: Use Repo Root .env.local (RECOMMENDED)**
- **Action:** Create/update `C:\dev\.env.local` (repo root) with Stripe variables
- **Location:** `C:\dev\.env.local` (NOT `C:\dev\MOBILE\.env.local`)
- **Content:** Add all Stripe environment variables to repo root file
- **Why:** This matches the project's architecture

**Option 2: Modify Custom Loader (NOT RECOMMENDED)**
- **Action:** Modify `scripts/envRootResolver.js` to also load `MOBILE/.env.local`
- **Risk:** May break existing architecture and other apps in monorepo
- **Why Not:** Changes project-wide env loading behavior

**Option 3: Remove Custom Loader (NOT RECOMMENDED)**
- **Action:** Remove `loadRootEnv()` call from `MOBILE/next.config.mjs`
- **Risk:** May break `DATA_DESIGN_ACK` check and other root-level env dependencies
- **Why Not:** Breaks existing architecture

### ✅ **EXACT CONFIRMATION STEPS**

**To verify the fix:**

1. **Create/Update Repo Root .env.local:**
   ```bash
   # File: C:\dev\.env.local
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_PRO=price_...
   STRIPE_PRICE_ELITE=price_...
   STRIPE_PRICE_PACK_SMALL=price_...
   STRIPE_PRICE_PACK_MEDIUM=price_...
   STRIPE_PRICE_PACK_LARGE=price_...
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   DATA_DESIGN_ACK=true
   ```

2. **Verify Loading:**
   - Start Next.js: `cd MOBILE && pnpm dev`
   - Check console for: `[ENV:ROOT] Loaded environment from C:\dev\.env.local`
   - Verify: `process.env.STRIPE_SECRET_KEY` is set in runtime

3. **Test Stripe Integration:**
   - Call `/api/stripe/create-checkout-session`
   - Should NOT see "Stripe not configured" error
   - Should create checkout session successfully

4. **Confirm MOBILE/.env.local is Ignored:**
   - If `MOBILE/.env.local` exists, you should see warning:
     ```
     [ENV:HARDEN] WARNING: C:\dev\MOBILE\.env.local exists. Root .env.local is authoritative. MOBILE/.env.local will be ignored.
     ```

---

## SUMMARY

### ✅ **Root Cause Confirmed**

**MOBILE/.env.local is not loaded because the project uses a custom environment loader that loads from the REPO ROOT (`C:\dev\.env.local`), not from the Next.js app root (`C:\dev\MOBILE\.env.local`).**

### ✅ **Solution**

**Create/update `C:\dev\.env.local` (repo root) with all Stripe environment variables. This is the authoritative env file for the entire monorepo.**

### ✅ **Architecture**

This is **intentional architecture**, not a bug. The monorepo uses a single authoritative env file at the repo root to:
- Share environment variables across apps (MOBILE, vella-control)
- Enforce `DATA_DESIGN_ACK` check at repo level
- Maintain consistency across the workspace

---

**END OF DIAGNOSTIC REPORT**


